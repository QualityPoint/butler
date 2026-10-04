# Quotation Line Editor

The Amenities section of a **Butler Quotation** (`amenities_html`). It is rendered by
`butler/public/js/quotation/amenities_editor.js` and mounted from `render_amenities_editor`
in `butler_quotation.js`. The `amenities` child table itself is hidden and read-only: it
holds two row types (amenity rows and their annex rows, see
[annexes.md](./quotation_pricing/annexes.md)), which a stock grid can't present.

---

## Layout: master–detail

```
[ Ground Floor 92 · SAR … ] [ First Floor 65 ] [ RF 48 ]
[ Butler Manager: (Ahmed ×) (Mona ×) ▾ ]  [ Search amenity or alias… ]
[ Customised ] [ Sound on ] [ Non-default light system ] [ Quotation Price changed ]
┌────────────────────────────┬──────────────────────────────────────────────────────┐
│ GUEST WC'S ×6     SAR …    │ Guest WC's  [Sara's Bath]       4 annexes   SAR …    │
│  Guest WC's        SAR …   │ Light System · Device · Light System Price · Sound…  │
│▸ Sara's Bath  ● Quotation… │ Annex | Qty | UOM | Price | Amount                   │
│ MAJLIS ×5         SAR …    │ …                                                    │
└────────────────────────────┴──────────────────────────────────────────────────────┘
```

- **Floor tabs.** One floor at a time, the same model as the Facility Builder. Each tab
  shows its room count (`shown of total` while a search or filter is on) and its total.
- **Room list (left).** The active floor's rooms, grouped under a heading per amenity
  (chevron, the Amenity's image, name, room count in a blue pill, total). The image is
  drawn with Frappe's `frappe.get_avatar` (the name's first letter on a palette colour
  when the Amenity has none) and read from the Amenity through `get_amenity_options`, so
  an image attached later shows without re-saving the quotation. Rooms carry no image. The heading is a full-width row the same size as a room
  row, sticks to the top while its own rooms scroll (each heading and its rooms share a
  `.butler-room-group` container, which is what scopes the stickiness: with the headings
  directly in the list, every heading scrolled past stayed pinned and they piled up), and **opens or closes its group**
  (click, Enter or Space). It uses the chevrons a collapsible form section uses
  (`chevron-right` / `es-line-down`, `frappe/form/section.js`). **Every group starts
  closed**, on each floor and for each quotation opened. Rooms are indented under their
  heading. A room shows its alias when it has one, otherwise the amenity name. A purple **●**
  means customised, and an orange **Quotation Price** badge means one of its Quotation Prices has
  been changed. ↑ / ↓ move through the rooms of the open groups while the list has focus.
- **Detail (right).** The selected room: a sticky title bar (amenity, alias, annex count,
  amount), then its add-ons and its annex table. Nothing is selected until you pick a
  room, and the pane says so. Closing the group of the selected room keeps its detail
  open, and its heading is marked.
- **Height.** The panel is `clamp(420px, 70vh, 720px)` tall, and the list and the detail
  scroll on their own. So a 90-room floor no longer pushes the rest of the quotation down.
  Below 768px it stacks: the list (max 300px) sits above the detail.

## Search and filters

The bar has three rows: the floor tabs; then **Butler Manager** and the search; then the
filter buttons. The search matches the amenity name or the alias. **Butler Manager** is a `MultiSelectList`, the control a Frappe report uses for a multi-value filter
(and the Facility Builder for Amenity Category). It offers only the managers whose
amenities are on this quotation (`butler_manager` on each row, copied from its Amenity),
each with its room count, and lists the rooms of any manager picked. Typing in its dropdown
narrows the managers offered. The control fires `onchange` from its own `set_value`, so a
reset goes through `set_managers`, which the change handler recognises and ignores.

The filter buttons are Frappe's own list-view filter buttons: `btn btn-sm btn-default`, at
`--btn-height` like the search box. Applied, each takes its own Frappe indicator colour
(`--bg-*` / `--text-on-*`, defined for light and dark), so several applied filters are
told apart at a glance: Customised purple, Sound on green, Non-default light system
yellow, Quotation Price changed orange. The list's ● and Quotation Price badge use the
same colours as their filters. They combine with each other, the search and
the manager (a room must pass all that are on):

| Chip | A room passes when |
|---|---|
| Customised | `annexes_customised`, or a light system other than the default, or `has_sound_system`. This is the Facility Builder's own rule (`has_custom_features` in `store.js`), so a room reads the same in both |
| Sound on | `has_sound_system` |
| Non-default light system | `light_system` is set and is not the Light System marked default |
| Quotation Price changed | `quotation_price_changed`, set by pricing; see [reference.md](./quotation_pricing/reference.md#the-three-price-tiers-and-the-quotation-price) |

**Changing the search, a filter, the managers, or the floor while filtering opens every
group that holds a match**, so a closed group never hides a result. This happens once per
change, so a group you close afterwards stays closed. Filters re-apply on every render. A live recalculation only repaints numbers, so a room
that stops matching while you edit it stays listed until the next render (a save, a floor
switch, or a filter change). An empty result shows *No rooms match* with *Clear filters*, which also clears the
managers and the search.

## What can be edited here

| Builder-owned (read-only here) | Quotation Price (editable here only) |
|---|---|
| annex quantity and UOM, light system, light system device, sound system on/off, alias | `qtn_annex_price`, `qtn_light_system_price`, `qtn_sound_system_price`, `qtn_floor_price` |

A Facility Builder save rebuilds the rows from the drawing, so composition edited here
would be overwritten. That is why those controls are locked and labelled *Set in the
Facility Builder*. The Quotation Prices survive the rebuild (`carry_forward_overrides`).
After Submit every control is read-only.

## How it keeps controls (the four rules)

The file follows the rules Frappe's own `Grid` / `GridRow` are built on (documented at the
top of the file):

1. **Details persist.** `cards` maps a placement to its `AmenityCard`. A detail is built
   the first time its room is selected and is then shown or hidden, never rebuilt, so
   returning to a room reuses its controls. A detail is retired only when its placement
   leaves the document.
2. **Selecting touches one room.** Only the newly selected room's detail is built.
3. **A control is built once.** The annex cells live as long as their detail.
4. **Repaint with `refresh()`.** After a live recalculation, `sync()` repaints the floor
   tabs, the list amounts and badges, and the details, without rebuilding anything.

The list and the floor tabs hold no controls, so they are redrawn on each render. The
list's scroll position is kept, and the selected item is scrolled into view.

**Per document.** Frappe reuses one form object for every Butler Quotation opened, so the
editor resets itself (`reset_for_document`) when the document or its docstatus changes:
the details are rebuilt (so Submit locks them), and for a different document the floor,
selection, search, managers and filters reset and the Amenity options are read again.

**Keys.** Details are keyed by `placement_id`, which survives a Facility Builder save
(docnames don't). A row that hasn't been saved yet has no id and is keyed by its docname.

## Refresh from Amenities

A draft quotation's **Refresh from Amenities** button (and the Butler Quotation list action
of the same name) re-copies the descriptive fields from each Amenity and Annex: Butler
Manager, image, category, annex name, manufacturer and so on. It also recounts the light
system devices. It never saves or reprices, and never changes which annexes a room has. See
[legacy_quotations.md](./legacy_quotations.md#refresh-from-amenities).
