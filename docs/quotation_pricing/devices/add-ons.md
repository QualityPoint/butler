# Per-amenity add-ons

These are priced on the **amenity row**, not per device — they are fitted for the amenity
as a whole.

| Add-on | Source | Amount |
|---|---|---|
| Light system | the `Amenity.light_systems` row matching the chosen `light_system`, else the **Light System master** | `±price × used_lines`, plus the default system's `±price × remaining lines` — see [Light systems](./light-systems.md) |
| Sound system | `Amenity.sound_system_price`, a flat figure — or, when that is `0`, **Butler Settings → `sound_system_default_price`** | the price when `has_sound_system`, else `0` |
| Floor extra | `Amenity.floor_extra_price` | `floor_price × floor_qty` |

`used_lines`, `light_system_price` and `light_system_pricing_mode` are **copied** by
`price_light_system`, not fetched: the per-amenity configuration lives on
`Amenity.light_systems` (keyed by Light System), so no `fetch_from` can reach it.

## Floor extra

`floor_qty` is the quotation's `floor_count` — the number of *distinct* floor types across
its lines — when the amenity is `depends_on_floor_count`, else `0`.

> **Floors are additive.** `Amenity.floor_extra_price` is defined as *"multiplied by the
> number of floors and **added** to the Amenity price"*. This replaces the older model in
> which `floor_count` multiplied the whole line.

## Sound system

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
