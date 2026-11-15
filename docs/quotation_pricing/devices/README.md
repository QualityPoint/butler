# Devices: the row model

An amenity has no price of its own. It is **composed from its devices** (the physical parts
fitted for it), plus three per-amenity add-ons: a light system, a sound system and a floor
extra. The quotation mirrors that composition, so a line is a **group** of rows. The code is
in `butler/butler/doctype/butler_quotation/butler_quotation.py`.

| File | Covers |
|---|---|
| [row-types.md](./row-types.md) | Amenity rows and device rows in one table, and how a device row finds its amenity row |
| [server-built-rows.md](./server-built-rows.md) | The `before_validate` steps, and what survives a Facility Builder save |
| [placements.md](./placements.md) | One row per placement; a placement keeps at least one device |
| [following-the-amenity.md](./following-the-amenity.md) | What happens when an Amenity's device list changes later |
| [device-pricing.md](./device-pricing.md) | Pricing a device row from its Device Price, and its UOM |
| [extra-devices.md](./extra-devices.md) | Devices from outside the Amenity's own list |
| [add-ons.md](./add-ons.md) | The per-amenity add-ons: floor extra and sound system |
| [light-systems.md](./light-systems.md) | Light system pricing and the default system's fill |
| [roll-up.md](./roll-up.md) | How the rows add up to the amenity's price |

Which fields each row type must have is in [validations.md](../validations.md#row-types).
