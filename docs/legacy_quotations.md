# Legacy Quotations and Reset Amenity

Two tools keep existing Butler Quotations in step with the current model:

| | When | Changes prices? |
|---|---|---|
| **`convert_legacy_quotations` patch** | once, on `bench migrate` | yes: repriced at today's standards, with a record of the old figures |
| **Reset Amenity** | whenever the Amenities change, or to undo edits on chosen rooms | *Details*: never; *Prices / Annexes / Light & sound*: yes, with a record |

Code: `butler/butler/doctype/butler_quotation/butler_quotation.py` (the section *the Facility
layout: quotation rows from the drawing*) and `butler/patches/v1_0/convert_legacy_quotations.py`.

---

## What a legacy quotation is

Quotations made before annexes and placements existed (`00002`–`00029` on the production copy,
except `00027`) hold **one consolidated row per (amenity, floor)**:

- the quantity and the flat price live in columns the doctype no longer defines (`qty`, `rate`,
  `amount`, …), so the form can't see them;
- there is no `placement_id` and no annex rows, so the line editor shows each row as one room
  without annexes;
- an ordinary form save would give the rows random placement ids that never match the rooms in
  the drawing.

Their **Facility drawing** (`geometry`) is intact. On the production copy the drawn rooms add
up to exactly the old rows' quantities in 23 of 24 quotations, so the drawing is what they
are rebuilt from.

## The one-time conversion

`convert_legacy_quotations` runs on `bench migrate`, **after** `add_light_system_devices`, so
the Light Systems already have devices to count. It picks drafts that have a drawing and whose
amenity rows carry no `placement_id`. Once a quotation is converted it no longer matches, so a
second run changes nothing.

For each quotation, `convert_legacy_quotation`:

1. **Resolves the drawn amenity names.** An exact name wins, then the same name ignoring case
   (`garage`, `lobby/distributor`), then `LEGACY_AMENITY_RENAMES` (`Pool` → **Pool Indoor**).
   Frappe's rename updated the rows' links but not the names inside the drawing JSON. The
   resolved names are written back into `geometry`, so the Facility Builder can save these
   quotations again. A name that still doesn't resolve stops that quotation only.
2. **Rebuilds the rows from the drawing** (`rows_from_geometry`, a port of the builder's
   `build_amenity_rows`): one amenity row per room, `placement_id` = the room's id.
3. **Saves**, and the usual pipeline does the rest:
   - `expand_amenity_rows` seeds each room's annexes from its Amenity's Annexes table. No
     legacy room had per-room annex edits, so the master composition is what it meant.
   - Pricing runs at today's Annex Prices.
   - `set_light_system_devices` fills the Devices table. Legacy rooms have no light system, so
     they take the default (Relay) over all their lines, with that system's default device.
     A quotation whose amenities have no lighting lines (CCTV, networking…) gets no devices.
4. **Keeps a record**: a timeline comment with the old → new Grand Total, the rooms, the
   devices, and the old rows (amenity, floor, qty × rate).

A quotation that fails is rolled back alone and written to the Error Log ("Legacy quotation
not converted: …"); the others still convert and the migrate doesn't stop.

On the production copy: 24 quotations, 3,514,889 → 3,852,672 SAR (+9.6%), per quotation from
−70% (`00002`, a CCTV + networking quotation) to about +24%.

After the conversion, re-syncing a quotation with its drawing is the **Facility Builder's own
Save**: it rebuilds the rows the same way, keeps every room's edited annexes, and keeps
changed Quotation Prices by placement id.

## Reset Amenity

A **Reset Amenity** button on a draft quotation, and the same action in the Butler Quotation
list for many selected quotations (run one at a time, with a progress bar). Its dialog asks
**which rooms** and **what to reset**. Server side: `reset_amenities`.

**Which amenities**

- *All amenities* on the quotation;
- *By amenity type*: every amenity of the chosen types (all Kitchens, all Majlis…);
- *Selected amenities*: individual amenities (drawn placements), listed as
  "Amenity · Floor · alias". This one is on the form only, because the placements differ per
  quotation.

"Amenity" here is one row of the quotation's Amenities table, i.e. one drawn placement. There
is no Room doctype: `rooms` is only the drawing's JSON key for its placements.

**What to reset** (any combination)

| Option | Resets the chosen amenities to | Reprices |
|---|---|---|
| **Details** | the descriptive fields of their Amenity and Annex (below) | no |
| **Prices** | every Quotation Price (annex, light system, sound system, floor) back to its standard | yes |
| **Annexes** | the Amenity's own annex list, undoing Facility Builder edits | yes |
| **Light & sound** | the default light system, sound off, no device picked | yes |

- **Details** re-copies:
  - amenity → `butler_manager`, `image`, `amenity_category`, `is_system_core`,
    `is_dependant_amenity`;
  - annex → `annex_name`, `annex_category`, `manufacturer`, `warranty`, `warranty_uom`,
    `annex_icon`.

  `lines`, `amenity_currency` and `depends_on_floor_count` move prices, so they are refreshed
  by a repricing save instead. `alias` and the descriptions (`fetch_if_empty`) are never
  overwritten. On its own, Details neither saves nor reprices.
- **The drawing is reset too.** Annexes, light & sound and device picks live in the Facility
  Builder drawing as well, so they are reset there:
  - `room.annexes`, `room.light_system`, `room.has_sound_system` and `room.light_system_device`;
  - with *All amenities*, also the facility-wide `default_light_system_device`.

  Otherwise the next builder save would bring the old values back.
- **Prices** clears the rooms' Quotation Prices and tells `carry_forward_overrides` to skip
  those placements (`flags.reset_prices`), so pricing re-derives them from their standards.
- **Composition and prices are independent.** *Annexes* alone keeps a changed Quotation Price
  on an annex that is still in the list. *Annexes* together with *Prices* gives the master list
  at standard prices.
- **Devices** are always recounted, and stale device picks are cleared.
- **A record is kept.** A reset that reprices is saved (which also refreshes every row's
  fetched details) and adds a timeline comment: what was reset, for which amenities, and the
  Grand Total old → new.

Nothing here touches a submitted quotation.

## Order on production

1. `bench migrate`: runs `add_light_system_devices`, then `convert_legacy_quotations`, then
   `sync_quotations_with_amenities`, which brings the other drafts in line with their Amenities'
   current annex lists, with a timeline note each (see [annexes.md](./quotation_pricing/annexes.md#an-amenitys-annex-list-changes-later)).
2. Complete the Amenities (Butler Managers, images).
3. In the Butler Quotation list, select the quotations, then **Reset Amenity → Details** (all amenities).

## Annex rows and fetched fields

Frappe copies `fetch_from` values in `_validate_links`, which runs *before* `before_validate`
(`Document._save`). Annex rows that `expand_amenity_rows` adds in `before_validate` used to
stay blank (name, category, manufacturer, icon…) until the quotation's next save. That
affected every quotation saved once from the Facility Builder. They are now filled when
seeded (`fill_fetched_fields`). Existing quotations with blank annex details are filled by
Reset Amenity → Details or by their next save.
