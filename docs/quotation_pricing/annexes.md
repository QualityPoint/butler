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
| Identifies | `amenity` + `floor_type` | the same, plus `annex` |
| Owns | `amenity_qty`, light system, sound system, floor extra | `annex_quantity`, `annex_uom`, `qtn_annex_price` |
| Price | **derived** — the sum of its group | resolved from **Annex Price** |

The amenity row's price ladder is read-only precisely because it is a roll-up: editing it
would contradict the annexes it is made of. What the user edits is one level down.

### How an annex row finds its amenity row

By the **`(amenity, floor_type, additional_amenity)` key** — the same triple
`consolidate_amenities` merges on. Including `additional_amenity` keeps an *included* and
an *additional* unit of one amenity on a floor apart.

That key is ambiguous in exactly one case: Butler Settings →
**Disable Amenity Consolidation** deliberately lets the same amenity sit on a floor more
than once, so the key repeats. There, **position** decides — an annex row belongs to the
*nearest preceding* amenity row carrying its key. `order_amenity_rows()` rewrites the
table on every save as `amenity row → its annex rows`, group after group, so adjacency is
always well-formed rather than trusted from the client.

> **Consequence:** with consolidation off, two otherwise identical amenity rows on one
> floor are told apart only by row order. Re-sorting the table outside
> `order_amenity_rows` would reassign their annexes.

### The rows are built server-side

| Step (`before_validate`) | Does |
|---|---|
| `clear_row_type_fields` | blanks the fields belonging to the *other* row type — stale data, not a user error, so it is cleared rather than rejected |
| `rescale_annex_quantities` | scales a row's annex quantities when its `amenity_qty` changed |
| `expand_amenity_rows` | seeds an amenity row's annex rows from `Amenity.annexes` when it has none, scaled by `amenity_qty` |
| `consolidate_amenities` | merges duplicate amenity groups, **adding up** both `amenity_qty` and the annex quantities |
| `order_amenity_rows` | lays the table out group by group and renumbers `idx` |

Because of `expand_amenity_rows`, every entry point — the Facility Builder, a data
import, the API — only has to send `{amenity, floor_type, amenity_qty}` and gets a fully
composed, priced line back. It runs **before** consolidation, so a placement that arrives
bare is carrying its own annex quantities by the time they are added up.

### Annex quantities are totals

Two kitchens each holding one display panel are one line of **two kitchens and two
panels** — the quantity the quotation is actually for, and the quantity a customer reads
off it. So the annex rows under a line add up to that line's amount:

```
Security Kitchen                             ×2      16,000
   Display Panel 4.3    qty 2   6,000        12,000
   AC                   qty 2   2,000         4,000
                                            ────────
                                              16,000   ✓
```

`amenity_qty` is therefore **not** a multiplier over the annexes. It multiplies only the
per-amenity add-ons — light system, sound system, floor extra — which are genuinely per
unit:

```
amenity_price  = Σ annex_amount / amenity_qty  +  light + sound + floor   # per unit
amenity_amount = amenity_price × amenity_qty
               = Σ annex_amount  +  (light + sound + floor) × amenity_qty
```

`amenity_price` stays per-unit because that is the rate an
[additional amenity](./additional-amenities.md) overflows at. Where a line's units differ
from one another, it is their average.

Quantities move in exactly two ways, and both are idempotent — re-saving never compounds:

- **`consolidate_amenities` adds them up.** Two annex rows fold together only when they
  agree on annex, uom and price, so a unit whose panel count was lowered, or whose price
  was discounted, contributes its own quantity at its own rate instead of being flattened
  into its twin. That is also how you price one unit differently from its twin: change it,
  and it stops folding.
- **`rescale_annex_quantities` follows a changed `amenity_qty`**, comparing against the
  stored row so it moves once per real change.

`absorb_annex_rows` handles one wrinkle. `qtn_annex_price` is derived later, in
`validate`, so a row the Facility Builder has just seeded carries no price and would read
as a different line from the identical row it duplicates. It folds into the single priced
row for its annex when there is exactly one; where several sit at different prices, which
one it belongs to is the very thing not to guess at, so it stands on its own.

> **Pre-existing data.** Quotations written before this changed hold per-unit quantities,
> and would lose value the next time they were saved. No patch ships for it — Butler is
> still in development and the data is disposable. One will be needed before release.

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
                       + sound_system_amount + floor_amount      # amenity currency, PER UNIT
qtn_amenity_price  = amenity_price × qtn_exchange_rate           # quotation currency
qtn_amenity_amount = qtn_amenity_price × amenity_qty
```

`amenity_qty` is applied **once**, at the end — which is why everything beneath it is a
per-unit figure.

Header totals then follow [amenities.md](./amenities.md#step-3--header-totals).

---

## Validation

`validate_row_types()` replaces the mandatory flags the fields can't carry (`annex_uom`
as `reqd` would block every amenity row):

| Row type | Must have | Must not have |
|---|---|---|
| Amenity | `amenity`, `floor_type`, `amenity_qty > 0` | annex fields (cleared automatically) |
| Annex | `annex_quantity > 0`, `annex_uom`, a resolvable amenity row | the add-on fields (cleared automatically) |

An annex must also be one of its amenity's own configured annexes, and an annex row that
matches no amenity row is rejected as unattached.

Price deviations are governed separately — see
[validations.md](./validations.md#annex-price--maintain_annex_price_action).
