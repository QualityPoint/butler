# Geocoding

Free text is turned into coordinates by **Nominatim** (OpenStreetMap), the geocoder Butler already
used for Address Settings' default map centre. No API key, no per-request cost — which is why plus
codes are decoded arithmetically rather than handed to Google's Geocoding API.

## One shared helper

`butler.utils.location.map_location.geocode` is the single Nominatim caller in the app:

```python
geocode("الراية, Madinah")       # free text
geocode(country="Saudi Arabia")  # Nominatim's structured country lookup
```

Returns `{latitude, longitude, matched_address}` or `None`.

**Address Settings calls it too.** `fetch_country_coordinates` previously issued its own inline
`requests.get`; it now delegates here, keeping its exact original query — the structured `country=`
form, not free-text `q=` — so behaviour is unchanged while the two callers can no longer drift apart.
Same endpoint, same `User-Agent: Butler/1.0`, same 10 s timeout as before, and it now picks up the
shared cache for free.

## Never raises

`geocode` returns `None` on any failure — timeout, HTTP error, no result — and logs it. This is what
lets the resolver chain treat a miss as *"not mine, try the next parser"*
([input_formats.md](input_formats.md)) instead of aborting a paste that a later parser could still
handle. Callers decide what a miss means; only `resolve_map_location` throws.

> `fetch_country_coordinates` is the caller that turns a miss back into an error, because for it a
> miss really is the end of the road — there is no next parser.

## Caching

Nominatim's usage policy asks for **≤ 1 request/second**. Facility addresses repeat heavily (same
city, same district, re-clicks of the same button), so results are cached in `frappe.cache()` for
**24 hours**, keyed on the normalised query.

**Misses are cached too** — an empty result would otherwise let repeated clicks hammer the rate limit
for a query already known to fail.

Because `_locality_candidates` can try several fragments for one paste
([plus_codes.md](plus_codes.md)), caching also means the second Facility in the same district usually
resolves with **no** network call at all.

## Short-link expansion is host-restricted

Expanding `maps.app.goo.gl/…` means fetching a URL supplied by the user, so `_expand_shortlink` first
checks the host against an allow-list:

```python
SHORTLINK_HOSTS = {"maps.app.goo.gl", "goo.gl", "maps.google.com", "www.google.com", "google.com"}
```

Anything else is returned unchanged and never fetched. Without this the endpoint would be an
**SSRF** vector — a whitelisted method that makes the server issue arbitrary requests, including to
internal addresses. Expansion failure is non-fatal: the original URL is returned and the remaining
parsers still run.
