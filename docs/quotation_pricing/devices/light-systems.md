# Light systems

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
> [light_system_devices.md](../../light_system_devices.md).

`Neutral` is retired from `Amenity Light System` and `Light System` — both now require
`Add` or `Subtract`. `Butler Quotation Item.light_system_pricing_mode` still offers it, for
rows that recorded it before the change.
