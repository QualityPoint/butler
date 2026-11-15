# One row per placement

**Every drawn amenity is its own quotation row.** Two kitchens on the ground floor are two
rows, each with its own devices, its own light system and its own sound setting — which is
the whole point: they can differ. `amenity_qty` is therefore always `1`, pinned in
`calculate_totals`, and a row's price is simply what that one placement contains:

```
amenity_price = Σ device_amount  +  light + sound + floor
```

> Butler used to merge placements of one amenity on one floor into a single row, summing
> `amenity_qty`, with **Butler Settings → Disable Amenity Consolidation** to turn it off.
> Both are gone. Consolidation and per-placement configuration are mutually exclusive, and
> the [Features layer](../../facility_builder/README.md) needs the latter.

## A placement must keep at least one device

`Amenity.devices` is a **mandatory** table on the master: an amenity is defined as what it
is composed of. So `validate_row_types` refuses a placement with none — it would be a line
worth nothing, contradicting the very thing it is a placement of. `devices_customised`
lets a placement drop *some* of its devices, never all of them; the Features panel greys
out the last remove button and says so.

> This is not the same as "priced at zero": a placement stripped of devices but fitted
> with a sound system still prices at the sound price. The rule is about composition, not
> about the total.
