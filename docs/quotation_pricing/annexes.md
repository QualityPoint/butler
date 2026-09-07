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
| `consolidate_amenities` | merges duplicate amenity groups, summing `amenity_qty`, and **dedupes** their annex rows |
| `expand_amenity_rows` | seeds an amenity row's annex rows from `Amenity.annexes` when it has none |
| `order_amenity_rows` | lays the table out group by group and renumbers `idx` |

Because of `expand_amenity_rows`, every entry point — the Facility Builder, a data
import, the API — only has to send `{amenity, floor_type, amenity_qty}` and gets a fully
composed, priced line back.

**Annex quantities are per amenity unit.** `amenity_qty` carries the multiplier, so
consolidation *dedupes* identical annex rows instead of summing them; doing both would
square the quantity. An annex whose uom, price or quantity was overridden differs from its
twin and survives as its own row rather than being folded away.

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
