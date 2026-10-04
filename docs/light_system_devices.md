# Light System Devices

How many lighting **controllers** a quotation needs. Controllers are bought for the whole
facility, not per amenity, so this is a **facility-level count**, not pricing:

| | Light system **pricing** | Light system **devices** |
|---|---|---|
| Scope | per amenity row | the whole facility (quotation header) |
| Code | `price_light_system`, `price_default_system_fill` ([annexes.md](./quotation_pricing/annexes.md#light-systems)) | `set_light_system_devices` and its helpers |
| Writes | the row's prices, amounts, `used_lines`, `default_system_*` | `light_system_device` on amenity rows; header `total_lines` and `devices` |
| Moves money | yes | **never** |

The device step runs right after `calculate_totals` (in `validate` and in the live
`recalculate`) and only **reads** the line split pricing settled. Pricing never reads a
device field.

---

## The masters

- **Light System Device**: the controller itself (manufacturer, warranty).
- **Light System → Devices** (`Light System Device Item`): the devices a system can be
  built with, each with its `channels_count` (how many lines one device drives). A device
  appears once per system. Exactly one row is `is_default`; with none ticked, the first row
  becomes the default (`LightSystem.validate_devices`).

## Who picks the device: the Facility Builder

| Where | Field | Serves | Seeded with |
|---|---|---|---|
| **Features panel**, per room | `room.light_system_device`, shown only when the room's system is **not** the default | that room's `used_lines` on its selected system | the selected system's default device; reset whenever the system changes |
| **Toolbar**, Features layer | *Default Light System Device*, one for the whole facility | **every** line of the default system: rooms that chose it **and** the fill on every other room | the default system's default device |

The room's device travels in `geometry` and on its amenity row (`Butler Quotation Item.
light_system_device`, read-only on the form). The facility default device is stored on
the quotation's `devices` row ticked `is_default`; the builder writes that row on save.

The server re-checks both (`resolve_row_devices`, `resolve_default_device`). A device not
configured on its system, or a blank one from the form, API or an import, falls back to the
system's default device. A row on the default system carries no device of its own.

## The count

`set_light_system_devices` sums lines per **(light system, device)** across the amenity
rows:

```
row on a non-default system   (row.light_system, row.light_system_device)  += used_lines
row on the default system     (default, default_device)                    += used_lines
fill on any row               (default, default_device)                    += default_system_lines

device_count = ceil(lines / channels_count)
```

One `devices` row per pair, the default system's first. Two rooms on DALI with different
devices give two DALI rows. `total_lines` is the sum of every amenity's lines.

```
Kitchen ×2, 7 lines, DALI configured for 5      DALI Gateway 64     10 lines / 64 ch → 1
everything else on Relay + both kitchens' fill   Relay Actuator 12CH 227 lines / 12 ch → 19
```

`manufacturer` / `warranty` are set explicitly rather than by `fetch_from`, which a
no-save recalc never runs. A system with no devices configured is left out of the count.
