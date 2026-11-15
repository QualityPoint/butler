# Rows built on the server

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

## What survives a Facility Builder save


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
