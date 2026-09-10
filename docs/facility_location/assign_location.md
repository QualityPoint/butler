# The Form: Field, Button & Writing the Pin

## Fields on Facility

| Field | Type | Role |
|---|---|---|
| `google_maps_location` | Data | what the user pastes |
| `assign_location` | Button | resolves it |
| `location` | Geolocation | the Leaflet pin (existing) |
| `latitude` / `longitude` | Float, read-only | derived from `location` (existing) |

The field is **not** named `google_map_url`: a URL is the shape users paste *least* often, so the name
would misdescribe its own contents. Its `description` states what is accepted, leading with the
plus-code form.

Every Facility owns its pin outright, so unlike the Waqf original there is no read-only or
hidden state to manage — see [README](README.md#a-facility-is-flat).

## Writing the pin — one write, one direction

The handler sets **only `location`**, never the floats:

```js
frm.set_value("location", butler.geolocation.build_geolocation_json(latitude, longitude));
frm.refresh_field("location");
```

The existing `location(frm)` handler already calls `butler.geolocation.sync_geolocation_to_floats`,
which fills `latitude`/`longitude` *and* enforces the single-pin rule. Writing the floats as well
would push the same value back the other way through `sync_floats_to_geolocation` — so the button
reuses wiring that is already correct rather than adding a second path.

Frappe's Geolocation control redraws itself on a programmatic set: `set_disp_area` →
`bind_leaflet_data` → `clear_editable_layers()`, render, then `fit_and_recenter_map()`
(`invalidateSize` + `fitBounds`). The pin appears and the map recentres with no extra work.

## Empty field is caught client-side

```js
if (!frm.doc.google_maps_location) { frappe.show_alert(…); return; }
```

No round trip for a case the browser can decide. `resolve_map_location` re-checks server-side anyway,
since it is a whitelisted method reachable independently of the form.

Otherwise the call runs with `freeze` + `freeze_message`, then reports the resolved `matched_address`
in a success alert — the same pattern as **Address Settings → Fetch Coordinates from Country**, so
Butler's two geocoding buttons behave identically.

## Localisation

Every user-facing string is wrapped (`__()` client-side, `_()` server-side) and translated in
`butler/translations/ar.csv` — 11 entries covering both field labels, the field description, and every
message and dialog title:

| English | العربية |
|---|---|
| Google Maps Location | موقع خرائط جوجل |
| Assign Location | تعيين الموقع |
| Resolving location… | جارٍ تحديد الموقع... |
| Location set: {0} | تم تعيين الموقع: {0} |
| Enter a Google Maps location first. | أدخل موقع خرائط جوجل أولاً. |

Placeholders (`{0}`, `{1}`) and inline `<code>` markup are preserved in the Arabic, and the CSV keys
are byte-exact copies of the source strings — including the `…` and `—` characters, which are easy to
retype wrongly and would silently break the lookup.
