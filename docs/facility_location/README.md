# Facility Location

**Assign Location** turns whatever the user copied out of Google Maps into a **Facility**'s map pin.
The user pastes into `google_maps_location`, clicks the button, and `location` (Geolocation) plus the
read-only `latitude` / `longitude` are filled in.

The pasted value is usually **not a URL** — Google's *Copy plus code* / *Copy address* returns a plus
code with a city (`FHPQ+WC Madinah`) for any place without a street number. So the feature is a chain
of parsers over several input shapes, and most of its design exists to stop it producing a pin that is
confidently in the wrong place.

Each concern below lives in its own module and its own doc file. The set grows by *adding* a file per
new concern; existing files don't change.

| Concern | Doc |
|---|---|
| Input formats & the resolver chain | [input_formats.md](input_formats.md) |
| Plus codes (Open Location Code) | [plus_codes.md](plus_codes.md) |
| Geocoding (Nominatim, caching, safety) | [geocoding.md](geocoding.md) |
| The form: field, button, writing the pin | [assign_location.md](assign_location.md) |

## Where it lives

| File | Role |
|---|---|
| `butler/utils/location/plus_code.py` | vendored Open Location Code — pure arithmetic, no frappe |
| `butler/utils/location/map_location.py` | the resolver chain + the shared `geocode` helper |
| `butler/butler/doctype/facility/facility.js` | the `assign_location` button |
| `butler/tests/test_plus_code.py` | 15 unit tests — no database, no network |

## The governing rule

> **A wrong pin is worse than a coarse one.**

Every design decision here follows from that: the chain is ordered so the most precise reading wins
([input_formats](input_formats.md)), a short plus code is refused rather than guessed
([plus_codes](plus_codes.md)), and failure is always an explicit `frappe.throw` — never a silent
no-op and never `0, 0`.

## It is server-side

`resolve_map_location` is a whitelisted method, so the form, the API and a data import all resolve
identically. The form contributes one thing only: it catches an empty field before making the call.
No coordinate is ever computed in the browser.

## A Facility is flat

This is the one place Butler's version differs from the [Waqf app's Property
location](../../../waqf/docs/property_location/README.md), which this was ported from. A Property is
a nested-set tree, so most of that feature is about a sub-property inheriting its pin, its territory
and its address from its parent — pull on save, push to the subtree on update, and a settings flag
governing all three.

A Facility has no parent, so **none of that applies and none of it was ported.** Every Facility owns
its own pin outright. `territory` is likewise a plain Link here: in Waqf it exists to be inherited,
and it is never derived from coordinates, so there was nothing to bring across.

## Applying a change

`facility.json` edits need the doctype synced before the form sees them:

```bash
bench --site butler.local migrate
bench --site butler.local clear-cache
```

`facility.js` is a doctype script served directly, so it needs no `bench build`.
