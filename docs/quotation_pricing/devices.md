# Devices — the row model

An amenity has no price of its own. It is **composed from its devices** (the physical
parts fitted for it), plus three per-amenity add-ons: a light system, a sound system, and
a floor extra. The quotation mirrors that composition, so a line is not one row but a
**group** of rows.

---

## Two row types, one table

`Butler Quotation.amenities` holds both. A row is an **device row** when `device` is set,
and an **amenity row** when it isn't.

| | Amenity row | Device row |
|---|---|---|
| Identifies | `placement_id` (+ `amenity`, `floor_type`) | the same, plus `device` |
| Owns | light system, sound system, floor extra, `devices_customised` | `device_quantity`, `device_uom`, `qtn_device_price` |
| Price | **derived** — the sum of its group | resolved from **Device Price** |

The amenity row's price ladder is read-only precisely because it is a roll-up: editing it
would contradict the devices it is made of. What the user edits is one level down.

### How a device row finds its amenity row

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
> [legacy_quotations.md](../legacy_quotations.md).

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

### The rows are built server-side

| Step (`before_validate`) | Does |
|---|---|
| `clear_row_type_fields` | blanks the fields belonging to the *other* row type — stale data, not a user error, so it is cleared rather than rejected |
| `ensure_placement_ids` | gives every row an id and re-homes any device row pointing at a placement that isn't there |
| `expand_amenity_rows` | keeps an amenity that isn't flagged `devices_customised` in line with `Amenity.devices`: when its device rows differ from the Amenity's list (a device added to or removed from the Amenity since), they are re-seeded; a matching group is left alone. A customised amenity is never touched |
| `carry_forward_overrides` | restores what the quotation owns (its Quotation Prices and Bundle designations) onto rows a Facility Builder save has just rebuilt |
| `order_amenity_rows` | lays the table out group by group and renumbers `idx` |

Because of `expand_amenity_rows`, every entry point — the Facility Builder, a data
import, the API — only has to send `{amenity, floor_type}` and gets a fully composed,
priced line back.

### One row per placement

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
> the [Features layer](../facility_builder/README.md) needs the latter.

### A placement must keep at least one device

`Amenity.devices` is a **mandatory** table on the master: an amenity is defined as what it
is composed of. So `validate_row_types` refuses a placement with none — it would be a line
worth nothing, contradicting the very thing it is a placement of. `devices_customised`
lets a placement drop *some* of its devices, never all of them; the Features panel greys
out the last remove button and says so.

> This is not the same as "priced at zero": a placement stripped of devices but fitted
> with a sound system still prices at the sound price. The rule is about composition, not
> about the total.

### An Amenity's device list changes later

A non-customised amenity **follows its Amenity**, on every save: a device added to the Amenity
appears (at its standard price), and one removed from it drops out. A changed Quotation Price
on a device that stays is kept (`carry_forward_overrides`). This is what a Facility Builder
save always did; a form save, Reset Amenity and the API now do it too.

Removing a device from an Amenity also deletes its Device Prices
(`Amenity.remove_stale_device_prices`). A quotation row may still point at one of them
(`device_price_list`). That link is cleared before Frappe's link check
(`ButlerQuotation._validate_links`), and pricing re-resolves it, so the save does not fail
with "Could not find … Device Price List".

A **customised** amenity keeps its own list. If it still holds a device its Amenity no longer
has, that device becomes an [extra device](#extra-devices): its Device Price is gone, so the price
it had is kept as a changed Quotation Price. *Reset Amenity → Devices* puts the placement back
on the Amenity's list.

**Once, on deploy:** the `sync_quotations_with_amenities` patch (after
`convert_legacy_quotations`) saves every draft that is behind its Amenities, or links a
deleted Device Price, and adds a timeline note "Synced with the Amenities' current device lists"
with the old → new total. So no total jumps unexplained the next time someone saves. The
device-price check is skipped for that system save (`flags.ignore_price_governance`), so a price
someone deliberately changed earlier does not stop it. A draft that fails is rolled back alone
and logged.

> On butler.local, `BTLR-QTN-2026-00030` (last saved 2026-09-16) was the case that showed
> this. AC had since been removed from Garage and Motion Sensor from Balcony, and light lines
> and other devices had been added to most Amenities. It was synced with Reset Amenity →
> Devices: 225,240.15 → 298,619.35, recorded in its timeline.

### What survives a Facility Builder save

The builder replaces the whole `amenities` table on every save — it is a projection of
`geometry`, rebuilt each time. `carry_forward_overrides` is what stops that being
destructive: matching on `placement_id` (and, for device rows, `(placement_id, device,
device_uom)` paired in order, so a placement holding the same device twice is not
collapsed), it copies back onto each incoming row:

| Row | Carried |
|---|---|
| Amenity | `qtn_light_system_price`, `qtn_sound_system_price`, `qtn_floor_price` — **and** their standard mirrors `light_system_price`, `sound_system_price`, `floor_price` |
| Device | `qtn_device_price` |
| Both | `qtn_exchange_rate` |
| Amenity | `additional_amenity`, on Bundle orders only |

It only fills what the incoming row left blank, so a form save that genuinely sets a new
price still wins.

**The standard mirrors are not optional, and the reason is easy to miss.**
`track_add_on_price` decides whether a Quotation Price has been changed by the user or is
still following its standard by comparing it against `previous_standard ×
previous_qtn_rate`, and it reads `previous_standard` off the row. Carry only the `qtn_`
price and `previous_standard` arrives as `0`, the comparison fails, and a Quotation Price
that was only following its standard is misread as changed and **frozen for good**: it
stops following its master forever. The carry does
not decide anything itself; it just supplies the value the existing rule compares against.

---

## Pricing a device row

```
device_price_list = get_device_price(device, amenity, facility_type)
    → the Device Price for this facility type, else the standard one (facility_type = "")

device_price  = Device Price.rate          # amenity currency, per device_uom
device_amount = device_price × device_quantity
```

`Device Price` replaced the old `Amenity.facility_type_prices`. The override now lives
**per device** rather than per amenity, and the mere existence of a facility-type row is
what makes a price changeable — there is no `has_changeable_price` gate any more. The
facility type comes from the quotation's `facility_type` (fetched from its Facility).

### Extra devices

A placement can be fitted with **any** enabled device, not only its Amenity's own: the
Features layer's *Add device* picker offers the whole catalogue. A device outside the
Amenity's `devices` table is an **extra device**.

It has no standard price. Device Prices are kept **per amenity**, so the same device can
carry a different price on every amenity that configures it, and none of them is *the*
price on another. Rather than guess, an extra device is priced at **0**, and the user sets
its price on the quotation:

| | Extra device |
|---|---|
| Flag | `is_extra_device` on the device row — read-only, set by `calculate_totals` on every recalculation (the device is not in `Amenity.devices`), never trusted from the client |
| Standard | `0` — `price_device_row` skips the Device Price lookup, so `device_price_list` stays empty |
| Quotation Price | `qtn_device_price` starts at `0`. Once set it is a changed Quotation Price like any other: kept across recalculations, currency changes and Facility Builder saves (`carry_forward_overrides`), and it marks the placement `quotation_price_changed` |
| Governance | **not checked** — `enforce_device_price` leaves it out, since its `0` is a placeholder rather than a published standard |
| Default qty / uom | `1`, in the device's default uom (its Item's sales or stock uom, `get_device_default_uom`) |
| Where it shows | gold with a superscript **+**: in the Features panel, on the plan (the icon in gold, a **+** on its corner), and in the quotation line editor's device table |

Adding one makes the placement customised (`devices_customised`), the same as any other
device edit, so `expand_amenity_rows` never re-seeds it away. **Reset** (Features panel) and
*Reset Amenity → Devices* drop it along with every other customisation.

The builder reads an extra device's name, icon and UOMs from `get_device_details`, since
`get_amenity_devices` only knows each amenity's own list.

### UOM

`device_uom` defaults to the Device Price's uom, else the device's Item `sales_uom` /
`stock_uom` (`get_device_default_uom`). `device_stock_uom` and `conversion_factor` are
resolved through the Device's Item with ERPNext's own `get_conversion_factor`, so Butler
follows the same UOM Conversion Detail rules as a Sales Order line.

> **`conversion_factor` never touches the money.** The rate is quoted *per `device_uom`*;
> the factor exists only to derive a stock quantity downstream. Applying it to the amount
> as well would double-count it.

---

## The per-amenity add-ons

These are priced on the **amenity row**, not per device — they are fitted for the amenity
as a whole.

| Add-on | Source | Amount |
|---|---|---|
| Light system | the `Amenity.light_systems` row matching the chosen `light_system`, else the **Light System master** | `±price × used_lines`, plus the default system's `±price × remaining lines` — see [Light systems](#light-systems) |
| Sound system | `Amenity.sound_system_price`, a flat figure — or, when that is `0`, **Butler Settings → `sound_system_default_price`** | the price when `has_sound_system`, else `0` |
| Floor extra | `Amenity.floor_extra_price` | `floor_price × floor_qty` |

`used_lines`, `light_system_price` and `light_system_pricing_mode` are **copied** by
`price_light_system`, not fetched: the per-amenity configuration lives on
`Amenity.light_systems` (keyed by Light System), so no `fetch_from` can reach it.

### Light systems

**Every line of the amenity is always priced, and a light system is always fitted.** A row
left blank adopts the Light System marked `is_default` and that choice is written back
onto the row, so the quotation records what was fitted rather than re-deriving it later
from a default that may since have changed. That happens in `price_light_system`, not only
in the Facility Builder, so a row typed on the form or posted by the API is governed too.

`light_system_config(amenity, system)` answers what one system costs here, and the
precedence is the whole feature:

| | price & mode from | `used_lines` |
|---|---|---|
| the amenity configures this system | its `Amenity.light_systems` row | that row's |
| it does not | the **Light System master** (`standard_price`, `pricing_mode`) | none — it covers every line |

So the amount splits in two:

```
selected covers `used_lines`      ±  qtn_light_system_price × used_lines
default fills the remainder       ±  default_price × (lines − used_lines)
```

Each half carries **its own sign**, which is the point: a DALI fitted on 2 of 6 lines can
credit the line under `Subtract` while the Relay filling the other 4 adds to it.

```
Bedroom, lines = 6      DALI configured 2 @ 300 Subtract      −600
                        Relay (default)  4 @ 200 Add          +800
                                                             -----
                                                              +200
```

When the selected system is **not** configured on the amenity there is no line count to
split on, so it covers all 6 at its master rate and there is no fill.

The fill is resolved through the *same* precedence — the amenity's own row for the default
system if it configures one, otherwise that system's master price. Only its
`used_lines` is ignored, because the fill's line count is whatever the selection left over.

> **Per line, never per placement.** `price_light_system` multiplies by lines only.
> `amenity_qty` is applied once by the caller on `qtn_amenity_amount`, so multiplying here
> as well would square it — invisible from the Facility Builder, which posts one row per
> placement at qty 1, and wrong everywhere else. `price_floor_extra` follows the same
> convention with `floor_qty`.

> **Only the selection has a Quotation Price.** `qtn_light_system_price` is the selected
> system's per-line price, settled by `track_add_on_price`. The fill is charged at
> standard: it is not what was chosen, it is what covers the rest. It is recorded read-only on the row
> (`default_system`, `default_system_lines`, `default_system_price`,
> `default_system_pricing_mode`, `default_system_amount` and their `qtn_`/`base_` mirrors)
> so an old quotation can still be explained after the default changes.

> **The line split also feeds the light system device count — but that is not pricing.** How many
> lighting controllers the facility needs is counted from these same `used_lines` /
> `default_system_lines`, after pricing and without moving any money. See
> [light_system_devices.md](../light_system_devices.md).

`Neutral` is retired from `Amenity Light System` and `Light System` — both now require
`Add` or `Subtract`. `Butler Quotation Item.light_system_pricing_mode` still offers it, for
rows that recorded it before the change.

`floor_qty` is the quotation's `floor_count` — the number of *distinct* floor types across
its lines — when the amenity is `depends_on_floor_count`, else `0`.

> **Floors are additive.** `Amenity.floor_extra_price` is defined as *"multiplied by the
> number of floors and **added** to the Amenity price"*. This replaces the older model in
> which `floor_count` multiplied the whole line.

**Sound system is the exception that doesn't scale.** It is a single flat price with no
mode and nothing to choose, so `has_sound_system` is the only thing distinguishing
"not fitted" from "fitted".

It is **offered on every amenity**, not only on those with a sound price. An Amenity whose
`sound_system_price` is `0` is charged Butler Settings' `sound_system_default_price`
instead. That default is in **company currency**, so `price_sound_system` converts it into
the amenity's currency through the row's `base_exchange_rate` before it becomes the row's
standard. A 750 SAR default on a USD amenity at 3.75 is a 200 USD standard, back to 750 on a
SAR quotation. From there it behaves exactly like an Amenity price: the
`qtn_sound_system_price` Quotation Price follows it until the user changes it, and a later
change to the default flows through to rooms whose Quotation Price is unchanged.

---

## Rolling up

```
amenity_price      = Σ device_amount + light_system_amount
                       + sound_system_amount + floor_amount      # amenity currency
qtn_amenity_price  = amenity_price × qtn_exchange_rate           # quotation currency
qtn_amenity_amount = qtn_amenity_price × amenity_qty             # amenity_qty is 1
```

`amenity_qty` is kept at `1` and the multiplication left in place, so the arithmetic still
adds up if a row ever carries another quantity.

Header totals then follow [amenities.md](./amenities.md#step-3--header-totals).

---

## Validation

`validate_row_types()` replaces the mandatory flags the fields can't carry (`device_uom`
as `reqd` would block every amenity row):

| Row type | Must have | Must not have |
|---|---|---|
| Amenity | `amenity`, `floor_type`, a `placement_id` (backfilled if absent) | device fields (cleared automatically) |
| Device | `device_quantity > 0`, `device_uom`, a resolvable amenity row | the add-on fields (cleared automatically) |

A device does **not** have to be one of its amenity's own: one from outside is an
[extra device](#extra-devices). A device row that matches no amenity row is rejected as
unattached, though `ensure_placement_ids` re-homes the recoverable cases first.

Price deviations are governed separately — see
[validations.md](./validations.md#device-price--maintain_device_price_action).
