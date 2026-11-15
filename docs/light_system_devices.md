# Light System Devices

How many lighting **controllers** a quotation needs. Controllers are bought for the whole
facility, not per amenity, so this is a **facility-level count**, not pricing:

| | Light system **pricing** | Light system **devices** |
|---|---|---|
| Scope | per amenity row | the whole facility (quotation header) |
| Code | `price_light_system`, `price_default_system_fill` ([devices.md](./quotation_pricing/devices.md#light-systems)) | `set_light_system_devices` and its helpers |
| Writes | the row's prices, amounts, `used_lines`, `default_system_*` | `light_system_device` on amenity rows; header `total_lines` and `light_system_devices` |
| Moves money | yes | **never** |

The light system device step runs right after `calculate_totals` (in `validate` and in the live
`recalculate`) and only **reads** the line split pricing settled. Pricing never reads a
light system device field.

---

## The masters

- **Light System Device**: the controller itself (manufacturer, warranty).
- **Light System → Light System Devices** (`Light System Device Item`): the light system
  devices a system can be built with, each with its `channels_count` (how many lines one
  drives). Each appears once per system. Exactly one row is `is_default`; with none ticked, the first row
  becomes the default (`LightSystem.validate_light_system_devices`).

## Who picks the light system device: the Facility Builder

| Where | Field | Serves | Without a pick |
|---|---|---|---|
| **Features panel**, per room | *Light System Device*, shown only when the room's system is **not** the default | that room's `used_lines` on its selected system | the selected system's current default light system device |
| **Toolbar**, Features layer | *Default Light System Device*, one for the whole facility | **every** line of the default system: rooms that chose it **and** the fill on every other room | the default system's current default light system device |

**Only deliberate picks are stored**, and they are stored in the drawing (`geometry`):

- `room.light_system_device` on a room;
- `default_light_system_device` on the envelope, for the facility.

Each field shows the light system device actually used (the pick, or the system's current default). A
light system device is stored only when someone chooses one other than that default. Choosing the default,
or clearing the field, removes the pick, and the room or facility goes back to *following* the
default. Changing a room's light system drops its pick.

**Why the drawing.** Every Facility Builder save rebuilds the rows from the drawing, so a pick
stored only on the quotation would be overwritten by the next builder save. The drawing never
holds a default either, so there is nothing stale in it when a default changes.

**Following the default.** The server resolves the light system devices on every save and on *Reset
Amenity* (`resolve_row_light_system_devices`, `resolve_default_light_system_device`, reading the
picks through `light_system_device_picks`):

- a pick is used while it is still configured on its system;
- anything without a pick gets its system's **current** default light system device.

So **changing a Light System's default light system device reaches every draft quotation** on its next save,
or at once with *Reset Amenity* (any option; form button or list action). Deliberate picks stay.
A pick whose light system device was removed from its Light System falls back to the default, and *Reset
Amenity* also clears it from the drawing (`prune_light_system_device_picks`), so the drawing and the
quotation agree.

The quotation shows the resolved light system device on each amenity row (`light_system_device`,
read-only) and on its Light System Devices table (the `is_default` row serves the default system).

## The count

`set_light_system_devices` sums lines per **(light system, light system device)** across the amenity
rows:

```
row on a non-default system   (row.light_system, row.light_system_device)  += used_lines
row on the default system     (default, default_light_system_device)      += used_lines
fill on any row               (default, default_light_system_device)      += default_system_lines

light_system_device_count = ceil(lines / channels_count)
```

One `light_system_devices` row per pair, the default system's first. Two rooms on DALI with different
light system devices give two DALI rows. `total_lines` is the sum of every amenity's lines.

```
Kitchen ×2, 7 lines, DALI configured for 5      DALI Gateway 64     10 lines / 64 ch → 1
everything else on Relay + both kitchens' fill   Relay Actuator 12CH 227 lines / 12 ch → 19
```

`manufacturer` / `warranty` are set explicitly rather than by `fetch_from`, which a
no-save recalc never runs. A system with no light system devices configured is left out of the count.
