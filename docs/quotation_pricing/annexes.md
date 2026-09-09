# Annexes — the row model

An amenity has no price of its own. It is **composed from its annexes** (the physical
parts fitted for it), plus three per-amenity add-ons: a light system, a sound system, and
a floor extra. The quotation mirrors that composition, so a line is not one row but a
**group** of rows.

---

## Two row types, one table

`Butler Quotation.amenities` holds both. A row is an **annex row** when `annex` is set,
and an **amenity row** when it isn't.

| | Amenity row | Annex row |
|---|---|---|
| Identifies | `placement_id` (+ `amenity`, `floor_type`) | the same, plus `annex` |
| Owns | light system, sound system, floor extra, `annexes_customised` | `annex_quantity`, `annex_uom`, `qtn_annex_price` |
| Price | **derived** — the sum of its group | resolved from **Annex Price** |

The amenity row's price ladder is read-only precisely because it is a roll-up: editing it
would contradict the annexes it is made of. What the user edits is one level down.

### How an annex row finds its amenity row

By its **`placement_id`** — the id of the drawn amenity it belongs to. Every row carries
one, and the pairing is explicit, so nothing depends on where a row sits in the table.

`placement_id` is the Facility Builder's `room.id`, sent with each row and stored in
`geometry`, which is what lets a quotation row be traced back to the shape that produced
it. Rows arriving any other way — the form, a data import, `frappe.client.insert` — never
carry one, so **`ensure_placement_ids` backfills them on every save**: an amenity row
without an id is given one, and an annex row whose id is missing (or names no amenity row
on the document) is adopted by the *nearest preceding* amenity row. That is also why no
migration was needed when the field was introduced — the migration is each document's
next save.

`order_amenity_rows()` still lays the table out as `amenity row → its annex rows`, but
now only so it reads well in a grid. Re-sorting the table can no longer reassign anything.

It also **keeps every placement of one amenity together**. One row per placement means a
plan drawn kitchen → office → kitchen would otherwise read back that way, and two lines of
the same amenity separated by a third is what makes a long quotation hard to check. The
clustering is by **first appearance** — floor first, then amenity within it — not by name,
so the table still follows the order things were actually drawn in; it only pulls the
duplicates together. Ranking the floor separately is what keeps a floor's lines
contiguous: keying on the `(floor, amenity)` pair alone would let a second floor's amenity
slot in between two of the first's.

### The rows are built server-side

| Step (`before_validate`) | Does |
|---|---|
| `clear_row_type_fields` | blanks the fields belonging to the *other* row type — stale data, not a user error, so it is cleared rather than rejected |
| `ensure_placement_ids` | gives every row an id and re-homes any annex row pointing at a placement that isn't there |
| `expand_amenity_rows` | seeds an amenity row's annex rows from `Amenity.annexes` when it has none and isn't flagged `annexes_customised` — it fills an empty group, it does not top up a short one |
| `carry_forward_overrides` | restores what the quotation owns onto rows a Facility Builder save has just rebuilt |
| `order_amenity_rows` | lays the table out group by group and renumbers `idx` |

Because of `expand_amenity_rows`, every entry point — the Facility Builder, a data
import, the API — only has to send `{amenity, floor_type}` and gets a fully composed,
priced line back.

### One row per placement

**Every drawn amenity is its own quotation row.** Two kitchens on the ground floor are two
rows, each with its own annexes, its own light system and its own sound setting — which is
the whole point: they can differ. `amenity_qty` is therefore always `1`, pinned in
`calculate_totals`, and a row's price is simply what that one placement contains:

```
amenity_price = Σ annex_amount  +  light + sound + floor
```

> Butler used to merge placements of one amenity on one floor into a single row, summing
> `amenity_qty`, with **Butler Settings → Disable Amenity Consolidation** to turn it off.
> Both are gone. Consolidation and per-placement configuration are mutually exclusive, and
> the [Features layer](../facility_builder/README.md) needs the latter.

### A placement must keep at least one annex

`Amenity.annexes` is a **mandatory** table on the master: an amenity is defined as what it
is composed of. So `validate_row_types` refuses a placement with none — it would be a line
worth nothing, contradicting the very thing it is a placement of. `annexes_customised`
lets a placement drop *some* of its annexes, never all of them; the Features panel greys
out the last remove button and says so.

> This is not the same as "priced at zero": a placement stripped of annexes but fitted
> with a sound system still prices at the sound price. The rule is about composition, not
> about the total.

### What survives a Facility Builder save

The builder replaces the whole `amenities` table on every save — it is a projection of
`geometry`, rebuilt each time. `carry_forward_overrides` is what stops that being
destructive: matching on `placement_id` (and, for annex rows, `(placement_id, annex,
annex_uom)` paired in order, so a placement holding the same annex twice is not
collapsed), it copies back onto each incoming row:

| Row | Carried |
|---|---|
| Amenity | `qtn_light_system_price`, `qtn_sound_system_price`, `qtn_floor_price` — **and** their standard mirrors `light_system_price`, `sound_system_price`, `floor_price` |
| Annex | `qtn_annex_price` |
| Both | `qtn_exchange_rate` |
| Amenity | `additional_amenity`, on Bundle orders only |

It only fills what the incoming row left blank, so a form save that genuinely sets a new
price still wins.

**The standard mirrors are not optional, and the reason is easy to miss.**
`track_add_on_price` decides whether a price is a negotiated override or a standard to
re-derive by comparing it against `previous_standard × previous_qtn_rate` — and it reads
`previous_standard` off the row. Carry only the `qtn_` price and `previous_standard`
arrives as `0`, the comparison fails, and an ordinary standard price is misread as
negotiated and **frozen for good**: it stops following its master forever. The carry does
not decide anything itself; it just supplies the value the existing rule compares against.

---

## Pricing an annex row

```
annex_price_list = get_annex_price(annex, amenity, facility_type)
    → the Annex Price for this facility type, else the standard one (facility_type = "")

annex_price  = Annex Price.rate          # amenity currency, per annex_uom
annex_amount = annex_price × annex_quantity
```

`Annex Price` replaced the old `Amenity.facility_type_prices`. The override now lives
**per annex** rather than per amenity, and the mere existence of a facility-type row is
what makes a price changeable — there is no `has_changeable_price` gate any more. The
facility type comes from the quotation's `facility_type` (fetched from its Facility).

### UOM

`annex_uom` defaults to the Annex Price's uom, else the annex's Item `sales_uom` /
`stock_uom` (`get_annex_default_uom`). `annex_stock_uom` and `conversion_factor` are
resolved through the Annex's Item with ERPNext's own `get_conversion_factor`, so Butler
follows the same UOM Conversion Detail rules as a Sales Order line.

> **`conversion_factor` never touches the money.** The rate is quoted *per `annex_uom`*;
> the factor exists only to derive a stock quantity downstream. Applying it to the amount
> as well would double-count it.

---

## The per-amenity add-ons

These are priced on the **amenity row**, not per annex — they are fitted for the amenity
as a whole.

| Add-on | Source | Amount |
|---|---|---|
| Light system | the `Amenity.light_systems` row matching the chosen `light_system` | `0` (Neutral) · `+price` (Add) · `−price` (Subtract) |
| Sound system | `Amenity.sound_system_price`, a flat figure | the price when `has_sound_system`, else `0` |
| Floor extra | `Amenity.floor_extra_price` | `floor_price × floor_qty` |

`used_lines`, `light_system_price` and `light_system_pricing_mode` are **copied** from the
Amenity's own configuration, not fetched: that configuration lives on
`Amenity.light_systems` (keyed by Light System), not on the Light System master, so no
`fetch_from` can reach it.

`floor_qty` is the quotation's `floor_count` — the number of *distinct* floor types across
its lines — when the amenity is `depends_on_floor_count`, else `0`.

> **Floors are additive.** `Amenity.floor_extra_price` is defined as *"multiplied by the
> number of floors and **added** to the Amenity price"*. This replaces the older model in
> which `floor_count` multiplied the whole line.

**Sound system is the exception that doesn't scale.** It is a single flat price with no
mode and nothing to choose, so `has_sound_system` is the only thing distinguishing
"not fitted" from "fitted".

---

## Rolling up

```
amenity_price      = Σ annex_amount + light_system_amount
                       + sound_system_amount + floor_amount      # amenity currency
qtn_amenity_price  = amenity_price × qtn_exchange_rate           # quotation currency
qtn_amenity_amount = qtn_amenity_price × amenity_qty             # amenity_qty is 1
```

`amenity_qty` is kept at `1` and the multiplication left in place, so the arithmetic still
adds up if a row ever carries another quantity.

Header totals then follow [amenities.md](./amenities.md#step-3--header-totals).

---

## Validation

`validate_row_types()` replaces the mandatory flags the fields can't carry (`annex_uom`
as `reqd` would block every amenity row):

| Row type | Must have | Must not have |
|---|---|---|
| Amenity | `amenity`, `floor_type`, a `placement_id` (backfilled if absent) | annex fields (cleared automatically) |
| Annex | `annex_quantity > 0`, `annex_uom`, a resolvable amenity row | the add-on fields (cleared automatically) |

An annex must also be one of its amenity's own configured annexes — which is why the
Features layer's "add annex" picker only offers what the Amenity configures; anything else
would have no Annex Price and would be refused here. An annex row that matches no amenity
row is rejected as unattached, though `ensure_placement_ids` re-homes the recoverable
cases first.

Price deviations are governed separately — see
[validations.md](./validations.md#annex-price--maintain_annex_price_action).
