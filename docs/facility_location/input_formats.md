# Input Formats & the Resolver Chain

One whitelisted entry point, `butler.utils.location.map_location.resolve_map_location(value)`, runs
four parsers in order and returns the first hit:

```python
{"latitude": 24.487313, "longitude": 39.588563,
 "source": "plus_code", "matched_address": "7GPXFHPQ+WC"}
```

`source` names the parser that won, so the client can tell the user how the pin was derived.

## The chain

| # | Parser | Accepts | Network |
|---|---|---|---|
| 1 | `_from_coordinates` | `24.487488, 39.588578` · `(24.487488 39.588578)` | none |
| 2 | `_from_url` | `/@lat,lng,17z` · `!3d<lat>!4d<lng>` · `?q=`/`query=`/`ll=`/`sll=`/`daddr=`/`center=`/`destination=` · `maps.app.goo.gl` short links | short links only |
| 3 | `_from_plus_code` | `7GPXFHPQ+XCW` · `FHPQ+WC Madinah` · `FHPQ+XCW, الراية، Madinah 42312` | short codes only |
| 4 | `_from_address` | `Quba Mosque, Madinah` | yes |

## Why the order is the design

The ordering is **most precise / cheapest first**, and it is load-bearing rather than cosmetic:

- **Plus codes must be tried before addresses.** `FHPQ+XCW, Abo Bakr Al Siddiq, الراية، Madinah 42312`
  contains both. Decoding the code gives a **~14 m** pin; geocoding the address text gives the street
  or city centroid, off by ~1 km. Reversing these two parsers silently degrades every paste.
- **Exact inputs never pay for a network call.** Coordinates and full plus codes resolve by
  arithmetic alone, so the common cases are instant and work offline.
- **Within a URL, `/@lat,lng` comes before `!3d!4d`** — the viewport centre is present on every long
  place URL, while the `!3d!4d` place coordinates are absent from some.

## Fall-through, not failure

A parser returning `None` means *"not mine — let the next one try"*, so partial matches degrade
gracefully instead of erroring:

- A `/place/<name>` URL carrying no coordinates falls through to geocoding the place name.
- A `?q=<something>` parameter is re-fed to the plus-code and address parsers.
- A plus code whose city fails to geocode falls through to plain address geocoding — less precise,
  but in the right place.

The one deliberate exception is a **bare short plus code**, which raises instead of falling through;
see [plus_codes.md](plus_codes.md).

## Failure is explicit

If every parser declines, `resolve_map_location` throws and names what is accepted. It never returns
an empty result and never falls back to `0, 0` — a pin off the coast of Africa is exactly the kind of
silent wrongness this module is built to avoid. An empty field is caught on the client before any
server call ([assign_location.md](assign_location.md)).

## Guards

- Coordinates must match the **whole** field (`^…$`), so a postal code inside an address
  (`Madinah 42312`) can never be read as a coordinate pair.
- Every candidate is range-checked (`-90..90`, `-180..180`) by `_point` before it is returned, so a
  regex matching digits that aren't coordinates is discarded rather than pinned.
