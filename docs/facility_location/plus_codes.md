# Plus Codes (Open Location Code)

Google Maps shows a **plus code** instead of a street address for any place without a street number —
which is a lot of what a Facility is likely to be. *Copy plus code* yields `FHPQ+WC Madinah`; *Copy
address* yields `FHPQ+XCW, Abo Bakr Al Siddiq, الراية، Madinah 42312`. Both are handled.

`butler/utils/location/plus_code.py` — pure arithmetic, **no I/O and no frappe import**, so it is
unit-testable without a site.

| Function | Purpose |
|---|---|
| `find_plus_code(text)` | first plus-code token in a string, uppercased, else `None` |
| `is_full(code)` | 8 characters before the `+` → a global code |
| `decode(code)` | full code → `(latitude, longitude)` at the **centre** of its cell |
| `recover_nearest(short, ref_lat, ref_lng)` | short code → the full code nearest a reference |

## Full vs short codes

- **Full** (`7GPXFHPQ+XCW`) — global. Decodes on its own, no network, no city needed.
- **Short** (`FHPQ+WC`) — *relative*. Its leading characters are omitted, so the same code repeats
  across the globe. It is meaningless without a nearby reference point.

Precision comes from length: 10 characters ≈ **14 m**, 11 ≈ **3.5 m**. So `FHPQ+WC` and `FHPQ+XCW` at
the same place resolve a few metres apart — both correct, at different resolutions.

## The reference point is the whole problem

A short code's padding is **1 degree** wide, so its reference must land within roughly half of that
(**~55 km**) or `recover_nearest` selects a *neighbouring cell* and returns a pin hundreds of
kilometres away — with no error.

This is not hypothetical. It was the first bug found when the feature was built for Waqf: anchoring
`FHPQ+XCW, … الراية، Madinah 42312` on the Saudi Arabia centroid produced `25.487, 42.588` — **350 km
from Madinah**, reported as a clean success.

Two rules follow, both in `map_location.py`:

1. **Try progressively broader fragments of the locality.** Nominatim rarely matches a full pasted
   address, so `_locality_candidates` splits on ASCII *and* Arabic commas (`،`), then tries the whole
   string, then drops leading segments one at a time, then individual segments back-to-front, also
   trying each with a trailing postal code stripped (`Madinah 42312` → `Madinah`). For the example
   above, `الراية, Madinah` matches.
2. **Never anchor on a country.** There is deliberately no country-level fallback: a country centroid
   is outside tolerance for anything bigger than a small state, and it fails confidently. If no
   locality resolves, the parser returns `None` and the chain falls through to plain address
   geocoding — coarser, but in the right place.

## A bare short code is refused, not guessed

`FHPQ+WC` alone has no locality and nothing to fall back to, so it raises an actionable message rather
than inventing an anchor:

> **FHPQ+WC** is a short plus code, so it needs a city to locate it. Include the city as Google shows
> it — for example **FHPQ+WC Madinah**.

This costs nothing in practice: Google always displays the city beside the code.

## Case handling

`find_plus_code` uppercases its result, so the code is stripped from the locality with a
**case-insensitive** `re.sub`. A plain `str.replace` silently failed on a lowercase paste
(`fhpq+wc madinah`), leaving the code inside the locality so nothing geocoded.

## Why vendored, not a dependency

`decode` + `recover_nearest` and their helpers are ~100 lines of arithmetic. Adding a bench-level pip
package for that would impose an install step on every deployment. Correctness is guaranteed by
**differential testing**: compared against Google's reference implementation over **4000 random
codes** at every precision length, both functions are identical. `butler/tests/test_plus_code.py`
locks that in with 15 tests (no database, no network) covering cell centres, grid refinement past 10
characters, southern and western hemispheres, case-insensitivity, and the reference-distance failure
mode above.

```bash
bench --site butler.local run-tests --app butler --module butler.tests.test_plus_code
```
