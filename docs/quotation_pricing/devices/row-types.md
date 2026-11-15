# Device rows and amenity rows

`Butler Quotation.amenities` holds both. A row is an **device row** when `device` is set,
and an **amenity row** when it isn't.

| | Amenity row | Device row |
|---|---|---|
| Identifies | `placement_id` (+ `amenity`, `floor_type`) | the same, plus `device` |
| Owns | light system, sound system, floor extra, `devices_customised` | `device_quantity`, `device_uom`, `qtn_device_price` |
| Price | **derived** — the sum of its group | resolved from **Device Price** |

The amenity row's price ladder is read-only precisely because it is a roll-up: editing it
would contradict the devices it is made of. What the user edits is one level down.

## How a device row finds its amenity row

By its **`placement_id`** — the id of the drawn amenity it belongs to. Every row carries
one, and the pairing is explicit, so nothing depends on where a row sits in the table.

`placement_id` is the Facility Builder's `room.id`, sent with each row and stored in
`geometry`, which is what lets a quotation row be traced back to the shape that produced
it. Rows arriving any other way — the form, a data import, `frappe.client.insert` — never
carry one, so **`ensure_placement_ids` backfills them on every save**: an amenity row
without an id is given one, and a device row whose id is missing (or names no amenity row
on the document) is adopted by the *nearest preceding* amenity row. That is also why no
migration was needed when the field was introduced — the migration is each document's
next save.

> Device rows seeded by `expand_amenity_rows` get their fetched details (name, category,
> manufacturer, icon) straight away (`fill_fetched_fields`). Frappe's own `fetch_from` runs
> before `before_validate`, so they used to stay blank until the next save. Quotations made
> before the current row model are converted once by a patch; see
> [legacy_quotations.md](../../legacy_quotations.md).

`order_amenity_rows()` still lays the table out as `amenity row → its device rows`, but
now only so it reads well in a grid. Re-sorting the table can no longer reassign anything.

It also **keeps every placement of one amenity together**. One row per placement means a
plan drawn kitchen → office → kitchen would otherwise read back that way, and two lines of
the same amenity separated by a third is what makes a long quotation hard to check. The
clustering is by **first appearance** — floor first, then amenity within it — not by name,
so the table still follows the order things were actually drawn in; it only pulls the
duplicates together. Ranking the floor separately is what keeps a floor's lines
contiguous: keying on the `(floor, amenity)` pair alone would let a second floor's amenity
slot in between two of the first's.
