# Extra devices

A placement can be fitted with **any** enabled device, not only its Amenity's own: the
Features layer's *Add device* picker offers the whole catalogue. A device outside the
Amenity's `devices` table is an **extra device**.

It has no Device Price: those are kept **per amenity**, so the same device can carry a
different price on every amenity that configures it, and none of them is *the* price on
another. Its standard is the Device's own **Standard Rate** instead, and the quotation can
change it:

| | Extra device |
|---|---|
| Flag | `is_extra_device` on the device row — read-only, set by `calculate_totals` on every recalculation (the device is not in `Amenity.devices`), never trusted from the client |
| Standard | `Device.standard_rate` (`extra_device_standard`), taken as is in the amenity's currency, per the device's default uom; `0` while the Device has none. No Device Price is looked up, so `device_price_list` stays empty |
| Quotation Price | `qtn_device_price` follows the standard until changed. A changed price is kept like any other: across recalculations, currency changes and Facility Builder saves (`carry_forward_overrides`), and it marks the placement `quotation_price_changed` |
| Governance | **checked** like any device: `enforce_device_price` applies Butler Settings → "Action if Device standard price is not maintained" (Stop or Warn, with its override role) to a Quotation Price that differs from the Standard Rate |
| Default qty / uom | `1`, in the device's default uom (its Item's sales or stock uom, `get_device_default_uom`) |
| Where it shows | gold with a superscript **+**: in the Features panel, on the plan (the icon in gold, a **+** on its corner), and in the quotation line editor's device table |

Adding one makes the placement customised (`devices_customised`), the same as any other
device edit, so `expand_amenity_rows` never re-seeds it away. **Reset** (Features panel) and
*Reset Amenity → Devices* drop it along with every other customisation.

The builder reads an extra device's name, icon and UOMs from `get_device_details`, since
`get_amenity_devices` only knows each amenity's own list.
