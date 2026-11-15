# Extra devices

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
