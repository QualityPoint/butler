"""
Open Location Code (Google Plus Code) decoding for pasted map locations.

Google Maps' "Copy address" returns a plus code whenever a place has no street
number — e.g. ``FHPQ+XCW, Abo Bakr Al Siddiq, الراية، Madinah 42312``. Decoding it
gives a ~14 m pin, where geocoding the address text alone would only reach the
street/city centroid, so the plus code is always preferred when one is present.

This is a vendored subset of the reference implementation (decode + recoverNearest
only, no encoding beyond the internal prefix helper) rather than a dependency: it
is pure arithmetic with no I/O, and adding a bench-level pip package for ~100 lines
of maths is not worth the install step. Semantics follow the spec exactly — the
grid resolutions, the 10-character pair encoding followed by the 4x5 grid
refinement, and recover_nearest's half-resolution snap.

Pure functions, no I/O and no frappe import, so it is unit-testable without a
site. Callers needing a reference point for a *short* code (see recover_nearest)
supply it themselves; geocoding lives in map_location.py.
"""

import re

# The code alphabet, minus vowels and characters that confuse readers.
ALPHABET = "23456789CFGHJMPQRVWX"
BASE = len(ALPHABET)
SEPARATOR = "+"
SEPARATOR_POSITION = 8
PADDING = "0"

# Codes are pair-encoded up to this length, then refined on a 4x5 grid.
PAIR_CODE_LENGTH = 10
GRID_COLUMNS = 4
GRID_ROWS = 5

# Degrees covered by the first character of each pair, i.e. the precision of a
# code truncated to 2, 4, 6, 8 or 10 characters.
PAIR_RESOLUTIONS = (20.0, 1.0, 0.05, 0.0025, 0.000125)

LATITUDE_MAX = 90.0
LONGITUDE_MAX = 180.0

# A plus code token: 2-8 code characters (or padding), a '+', then 0-8 more.
_PLUS_CODE_RE = re.compile(
    rf"\b([{ALPHABET}{PADDING}]{{2,8}}\{SEPARATOR}[{ALPHABET}]{{0,8}})\b",
    re.IGNORECASE,
)


def find_plus_code(text):
    """Return the first plus-code token in `text`, uppercased, or None.

    Used to both detect a plus code and split it from its locality (the rest of
    the pasted string), which a short code needs as a reference — see
    recover_nearest.
    """
    if not text:
        return None
    match = _PLUS_CODE_RE.search(text)
    return match.group(1).upper() if match else None


def is_full(code):
    """True for a global code (8 characters before the '+'), which decodes on its
    own. A shorter code is relative and must go through recover_nearest first."""
    code = (code or "").upper()
    return SEPARATOR in code and code.index(SEPARATOR) == SEPARATOR_POSITION


def decode(code):
    """Decode a full code to the (latitude, longitude) *centre* of its area.

    The centre — not the corner — so the pin sits in the middle of the block the
    code names, which is what Google Maps shows.
    """
    code = _strip(code)
    if not code:
        _invalid(code)

    latitude = -LATITUDE_MAX
    longitude = -LONGITUDE_MAX
    lat_resolution = 400.0
    lng_resolution = 400.0

    index = 0
    while index < len(code):
        if index < PAIR_CODE_LENGTH:
            # Pair encoding: one character each for latitude and longitude.
            lat_resolution /= BASE
            lng_resolution /= BASE
            latitude += lat_resolution * ALPHABET.index(code[index])
            longitude += lng_resolution * ALPHABET.index(code[index + 1])
            index += 2
        else:
            # Grid refinement: one character encodes a 4x5 cell.
            lat_resolution /= GRID_ROWS
            lng_resolution /= GRID_COLUMNS
            digit = ALPHABET.index(code[index])
            latitude += lat_resolution * (digit // GRID_COLUMNS)
            longitude += lng_resolution * (digit % GRID_COLUMNS)
            index += 1

    return latitude + lat_resolution / 2, longitude + lng_resolution / 2


def recover_nearest(short_code, reference_latitude, reference_longitude):
    """Expand a short code (e.g. ``FHPQ+XCW``) into the full code nearest a
    reference point.

    A short code omits its leading characters, so it is ambiguous on its own —
    the same code repeats across the globe. The reference (in practice, the
    locality geocoded from the rest of the pasted string) selects which one is
    meant. Already-full codes are returned unchanged.
    """
    short_code = (short_code or "").upper()
    if is_full(short_code):
        return short_code
    if SEPARATOR not in short_code:
        _invalid(short_code)

    padding_length = SEPARATOR_POSITION - short_code.index(SEPARATOR)
    resolution = PAIR_RESOLUTIONS[padding_length // 2 - 1]
    half_resolution = resolution / 2.0

    reference_latitude = _clip_latitude(reference_latitude)
    reference_longitude = _normalize_longitude(reference_longitude)

    code = _encode_prefix(reference_latitude, reference_longitude, padding_length) + short_code
    latitude, longitude = decode(code)

    # The prefix borrowed from the reference can land the result one cell away.
    # Snap to whichever neighbouring cell actually sits nearest the reference.
    if reference_latitude + half_resolution < latitude and latitude - resolution >= -LATITUDE_MAX:
        latitude -= resolution
    elif reference_latitude - half_resolution > latitude and latitude + resolution <= LATITUDE_MAX:
        latitude += resolution

    if reference_longitude + half_resolution < longitude:
        longitude -= resolution
    elif reference_longitude - half_resolution > longitude:
        longitude += resolution

    return _encode_prefix(latitude, longitude, padding_length) + short_code


# ── internals ───────────────────────────────────────────────────────────────
def _strip(code):
    """Normalize a code for decoding: uppercase, separator and padding removed."""
    return (code or "").upper().replace(SEPARATOR, "").rstrip(PADDING)


def _encode_prefix(latitude, longitude, length):
    """Encode just the leading `length` characters of a position — the part a
    short code omits."""
    latitude += LATITUDE_MAX
    longitude += LONGITUDE_MAX

    prefix = ""
    lat_resolution = 400.0
    lng_resolution = 400.0
    for _ in range(length // 2):
        lat_resolution /= BASE
        lng_resolution /= BASE
        prefix += ALPHABET[min(int(latitude // lat_resolution), BASE - 1)]
        latitude %= lat_resolution
        prefix += ALPHABET[min(int(longitude // lng_resolution), BASE - 1)]
        longitude %= lng_resolution
    return prefix


def _clip_latitude(latitude):
    return min(max(float(latitude), -LATITUDE_MAX), LATITUDE_MAX)


def _normalize_longitude(longitude):
    longitude = float(longitude)
    while longitude < -LONGITUDE_MAX:
        longitude += 360
    while longitude >= LONGITUDE_MAX:
        longitude -= 360
    return longitude


def _invalid(code):
    """Raise a plain ValueError, not frappe.throw — this module stays free of
    frappe so it can be unit-tested without a site. map_location translates it
    into a user-facing message."""
    raise ValueError(f"{code or ''!r} is not a valid plus code")
