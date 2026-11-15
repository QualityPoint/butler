# Device rename patches

The former **Annex** is called **Device**. The light-system controllers are **Light System
Devices**, so "Device" alone always means the former annex. Four patches move a site's
schema across on `bench migrate`. Record names stay as the site wrote them.

| Patch (`butler/patches/v1_0/`) | Section | Renames |
|---|---|---|
| `rename_light_system_device_fields` | `pre_model_sync` | light-system `device…` fields to `light_system_device…`, and both `devices` tables to `light_system_devices` |
| `rename_annex_to_device` | `pre_model_sync` | the DocTypes Annex, Annex Category, Annex Type, Annex Price, Amenity Annex Item; their fields; `Amenity.annexes`; the Butler Settings fields; Item's `is_annex` |
| `rename_annex_in_print_formats_and_drawings` | `pre_model_sync` | old names inside site print formats and Facility Builder drawings |
| `rename_annex_in_sidebars` | `post_model_sync` | site sidebars' Annex labels, adding Device Type beside them |

Each field map is a constant in its patch (`COLUMNS`, `SETTINGS`, `TABLES`). This doc does
not repeat them.

## How a field is renamed

`butler/utils/schema_rename.py` renames the column in place with `ALTER TABLE … RENAME
COLUMN`, before the new DocType files sync. Frappe's `frappe.db.rename_column` restates only
the type, which drops `NOT NULL` and the `0` default on number and check columns, and model
sync never puts them back (`frappe/database/schema.py`).

With each rename it updates what points at the old fieldname: saved reports, report view and
list settings, and property setters (`frappe/model/utils/rename_field.py`). DocTypes go
through `frappe.rename_doc`. Saved list settings (`__UserSettings`) are keyed by DocType, so
the patch moves them itself.

A patch that finds a column or DocType already renamed skips it. If both the old and the new
exist, it stops and asks for a hand merge.

## What is changed and what is only listed

| Site content | What happens |
|---|---|
| Print formats (`standard = No`) | DocType and field names inside `{{ }}` and `{% %}`, and builder layout fieldnames. Visible text stays |
| Drawings (`geometry`) | `room.annexes: [{annex, …}]` becomes `room.devices: [{device, …}]` |
| Sidebars (`standard = 0`) | the exact labels Annex Setup, Annex, Annex Category, Annex Type, Annex Price. One that fails to save is skipped and logged ("Sidebar … annex items not renamed") |
| Client and Server Scripts, Reports, Notifications | not edited; any that mention annex are listed in the Error Log as "Annex renamed to Device: check these" |

## Deploying

1. Back up the site's database first. DocType renames cannot be rolled back by a migrate.
2. `bench --site <site> migrate`, then read the Error Log for the list above.
3. The site's `tabAmenity Annex` table, if any, is a leftover of an older DocType. The patches
   leave it alone.

Tests: `butler/tests/test_rename_annex_patch.py` (print formats, drawings, sidebars) and
`butler/tests/test_schema_rename.py` (column definition kept, clash refused).
