"""
Resolve a pasted Google Maps value into coordinates for a Facility's pin.

Users paste whatever Google Maps hands them, which is rarely a URL: "Copy address"
returns a *plus code* plus a locality for any place without a street number
(``FHPQ+XCW, Abo Bakr Al Siddiq, الراية، Madinah 42312``), while "Share" returns a
short link, and the address bar a long one. So this is a chain of parsers over
several input shapes rather than URL parsing.

The chain is ordered most-precise / cheapest first, and **that ordering is the
precision guarantee**: a plus code must be tried before the address fallback, or
the example above degrades from a ~14 m pin to a city centroid. Exact inputs
(coordinates, full plus codes, URLs carrying lat/lng) resolve with no network call
at all.

    1. _from_coordinates  "24.4875, 39.5886"                       no network
    2. _from_url          /@lat,lng,17z · !3d..!4d.. · ?q=lat,lng  short links only
    3. _from_plus_code    full -> decode; short -> geocode locality, recover  short only
    4. _from_address      plain text -> forward geocode            network

Geocoding uses Nominatim, already Butler's geocoder — Address Settings'
`fetch_country_coordinates` calls the same `geocode` helper below, so the two can
no longer drift apart.
"""

import re
from urllib.parse import parse_qs, unquote, urlparse

import frappe
import requests
from frappe import _

from butler.utils.location import plus_code

NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Butler/1.0"
TIMEOUT = 10
# Nominatim's usage policy asks for <= 1 request/second; facility addresses repeat
# a lot (same city, same district), so cache resolved queries for a day.
CACHE_TTL = 24 * 60 * 60

# Only these hosts are ever fetched when expanding a short link. User input drives
# the request, so an open redirect-follower would be an SSRF hole.
SHORTLINK_HOSTS = {
    "maps.app.goo.gl",
    "goo.gl",
    "maps.google.com",
    "www.google.com",
    "google.com",
}

LAT_LNG = r"(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)"
# A bare coordinate pair: the whole field, nothing else (so a postcode like
# "42312" in an address can never be mistaken for one).
_COORDS_RE = re.compile(rf"^\(?\s*{LAT_LNG}\s*\)?$")
# Google's URL forms, most reliable first.
_AT_RE = re.compile(rf"/@{LAT_LNG}")
_BANG_RE = re.compile(r"!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)")
_PLACE_RE = re.compile(r"/(?:place|search)/([^/@?]+)")
_QUERY_KEYS = ("q", "query", "ll", "sll", "daddr", "center", "destination")


@frappe.whitelist()
def resolve_map_location(value):
    """Resolve a pasted Google Maps value to a pin.

    Returns {latitude, longitude, source, matched_address}; `source` names the
    parser that won, so the caller can tell the user how the pin was derived.
    Raises rather than returning an empty/0,0 result — a silently wrong pin is
    worse than an error.
    """
    value = (value or "").strip()
    if not value:
        frappe.throw(_("Enter a Google Maps location first."), title=_("Nothing to Resolve"))

    for parser in (_from_coordinates, _from_url, _from_plus_code, _from_address):
        result = parser(value)
        if result:
            return _finalize(result)

    frappe.throw(
        _(
            "Could not resolve {0} to a location. Paste a Google Maps link, a plus code, "
            "an address, or coordinates as <code>latitude, longitude</code>."
        ).format(frappe.bold(value)),
        title=_("Location Not Found"),
    )


# ── 1. bare coordinates ─────────────────────────────────────────────────────
def _from_coordinates(value):
    match = _COORDS_RE.match(value)
    if not match:
        return None
    point = _point(match.group(1), match.group(2))
    return dict(point, source="coordinates") if point else None


# ── 2. Google Maps URLs ─────────────────────────────────────────────────────
def _from_url(value):
    if not re.match(r"^https?://", value, re.IGNORECASE):
        return None

    url = _expand_shortlink(value)

    # /@lat,lng,zoom — the map viewport, present on any long place URL.
    match = _AT_RE.search(url)
    if match and (point := _point(match.group(1), match.group(2))):
        return dict(point, source="url")

    # !3d<lat>!4d<lng> — the place's own coordinates, more exact than the viewport
    # but absent from some URLs, hence second.
    match = _BANG_RE.search(url)
    if match and (point := _point(match.group(1), match.group(2))):
        return dict(point, source="url")

    # ?q=lat,lng and friends — may hold coordinates or a place name.
    params = parse_qs(urlparse(url).query)
    for key in _QUERY_KEYS:
        for raw in params.get(key, []):
            raw = unquote(raw).strip()
            if match := _COORDS_RE.match(raw):
                if point := _point(match.group(1), match.group(2)):
                    return dict(point, source="url")
            if raw and (nested := _from_plus_code(raw) or _from_address(raw)):
                return nested

    # A /place/<name> URL with no coordinates at all: fall through to the name.
    if match := _PLACE_RE.search(urlparse(url).path):
        name = unquote(match.group(1)).replace("+", " ").strip()
        if name:
            return _from_plus_code(name) or _from_address(name)

    return None


def _expand_shortlink(url):
    """Follow a Google short link to the long URL that carries the coordinates.

    Restricted to Google hosts (see SHORTLINK_HOSTS) — this fetches a URL supplied
    by the user, so it must not become a general-purpose request proxy. Failure is
    non-fatal: return the original and let the later parsers try.
    """
    host = (urlparse(url).hostname or "").lower()
    if host not in SHORTLINK_HOSTS:
        return url
    try:
        response = requests.get(
            url, allow_redirects=True, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}
        )
        return response.url or url
    except Exception:
        frappe.log_error(f"Could not expand map short link: {url}", "Map Location")
        return url


# ── 3. plus codes ───────────────────────────────────────────────────────────
def _from_plus_code(value):
    """Decode a plus code. A *full* code (8 chars before the '+') stands alone; a
    *short* one is relative, so the rest of the pasted string is geocoded to give
    recover_nearest its reference point."""
    code = plus_code.find_plus_code(value)
    if not code:
        return None

    try:
        if not plus_code.is_full(code):
            # find_plus_code uppercases its result, so strip it back out
            # case-insensitively — otherwise a lowercase paste leaves the code
            # sitting in the locality and nothing geocodes.
            locality = re.sub(re.escape(code), " ", value, flags=re.IGNORECASE)

            if not _locality_candidates(locality):
                # A short code is relative and means nothing on its own — the same
                # code repeats worldwide. Guessing (e.g. from the default country)
                # yields a confident pin in the wrong region, so ask instead.
                frappe.throw(
                    _(
                        "{0} is a short plus code, so it needs a city to locate it. "
                        "Include the city as Google shows it — for example {1}."
                    ).format(frappe.bold(code), frappe.bold(f"{code} Madinah")),
                    title=_("Incomplete Plus Code"),
                )

            reference = _reference_point(locality)
            if not reference:
                # The locality didn't geocode; plain address geocoding (the next
                # parser) is less precise but lands in the right place.
                return None
            code = plus_code.recover_nearest(code, reference["latitude"], reference["longitude"])

        latitude, longitude = plus_code.decode(code)
    except ValueError:
        # Something that looked like a code but isn't; let the address parser try.
        return None

    point = _point(latitude, longitude)
    return dict(point, source="plus_code", matched_address=code) if point else None


def _reference_point(locality):
    """Where to anchor a short plus code: the locality pasted alongside it.

    Accuracy matters more here than anywhere else in this module. A short code's
    padding is 1 degree wide, so the reference must land within roughly half of
    that (~55 km) or recover_nearest picks a *neighbouring* cell and produces a
    confidently wrong pin hundreds of km away. Nominatim rarely matches a full
    pasted address ("Abo Bakr Al Siddiq, الراية، Madinah 42312" → no result), so
    try progressively broader fragments until one resolves, rather than giving up
    after one all-or-nothing query.

    Returns None when nothing resolves — the caller then falls through to plain
    address geocoding, which is less precise but lands in the right place. There
    is deliberately no country-level fallback: a country centroid is far outside
    the ~55 km tolerance for anything larger than a small state, and it fails
    *confidently*. A wrong pin is worse than a coarse one.
    """
    for candidate in _locality_candidates(locality):
        if hit := geocode(candidate):
            return hit
    return None


def _locality_candidates(locality):
    """Fragments of the pasted locality to try as a geocoding anchor, most
    specific first.

    Google separates parts with either an ASCII or an Arabic comma. The most
    reliably geocodable part is the tail (city, region), so after the whole
    string, drop leading segments one at a time, then try individual segments
    from the back. Trailing postal codes are also tried stripped, since they
    often prevent a match ("Madinah 42312" vs "Madinah").
    """
    segments = [re.sub(r"\s+", " ", segment).strip() for segment in re.split(r"[,،]", locality or "")]
    segments = [segment for segment in segments if segment and not segment.isdigit()]

    candidates = []
    for start in range(len(segments)):
        candidates.append(", ".join(segments[start:]))
    candidates.extend(reversed(segments))

    expanded = []
    for candidate in candidates:
        expanded.append(candidate)
        # "Madinah 42312" -> "Madinah"
        trimmed = re.sub(r"\s+\d{4,}$", "", candidate).strip()
        if trimmed and trimmed != candidate:
            expanded.append(trimmed)

    seen = set()
    return [c for c in expanded if not (c in seen or seen.add(c))]


# ── 4. plain address ────────────────────────────────────────────────────────
def _from_address(value):
    hit = geocode(value)
    if not hit:
        return None
    return dict(hit, source="address")


# ── geocoding (shared with Address Settings) ────────────────────────────────
def geocode(query=None, *, country=None):
    """Forward-geocode via Nominatim. Returns {latitude, longitude,
    matched_address} or None. Cached, and never raises — callers treat None as
    "this parser didn't match" so the chain can continue.

    Pass `query` for free text, or `country` for Nominatim's structured
    country-restricted lookup (what Address Settings' default map centre uses).
    """
    search = {"country": country.strip()} if country else {"q": (query or "").strip()}
    if not (country or "").strip() and not search.get("q"):
        return None

    cache_key = "butler:geocode:" + ":".join(f"{k}={v}" for k, v in sorted(search.items()))
    cached = frappe.cache().get_value(cache_key)
    if cached is not None:
        return cached or None

    try:
        response = requests.get(
            NOMINATIM_SEARCH,
            params={**search, "format": "json", "limit": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        results = response.json()
    except Exception:
        frappe.log_error(f"Geocoding failed for: {search}", "Map Location")
        return None

    if not results:
        # Cache the miss too, so repeated clicks don't re-hit the rate limit.
        frappe.cache().set_value(cache_key, {}, expires_in_sec=CACHE_TTL)
        return None

    hit = {
        "latitude": float(results[0]["lat"]),
        "longitude": float(results[0]["lon"]),
        "matched_address": results[0].get("display_name"),
    }
    frappe.cache().set_value(cache_key, hit, expires_in_sec=CACHE_TTL)
    return hit


# ── helpers ─────────────────────────────────────────────────────────────────
def _point(latitude, longitude):
    """Validated {latitude, longitude}, or None when out of range — guards against
    a regex matching digits that aren't really coordinates."""
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        return None
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None
    return {"latitude": latitude, "longitude": longitude}


def _finalize(result):
    result.setdefault("matched_address", None)
    result["latitude"] = round(result["latitude"], 7)
    result["longitude"] = round(result["longitude"], 7)
    return result
