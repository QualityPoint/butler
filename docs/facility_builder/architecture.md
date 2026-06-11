# Architecture

Facility Builder is **Pattern 3** (lazy bundle + shared store) from [`../vue/pattern-lazy-bundle.md`](../vue/pattern-lazy-bundle.md), applied to the Facility doctype. Read that file for the generic mechanics; this file covers only what's specific to Facility Builder.

---

## Surface: a Page Launched From the Form

The builder is a standalone desk page, opened with the facility name in the route — exactly like Print Format Builder.

```
Facility form  ──[ "Open Facility Builder" button ]──►  frappe.set_route("facility-builder", frm.doc.name)
                                                                │
facility-builder page  ── frappe.require("facility_builder.bundle.js") ──►  new frappe.ui.FacilityBuilder({ facility })
```

### Launch button (Facility form controller)

```javascript
// butler/butler/doctype/facility/facility.js
frappe.ui.form.on("Facility", {
    refresh(frm) {
        if (frm.is_new()) return;            // need a saved doc to attach geometry to
        frm.add_custom_button(__("Open Facility Builder"), () => {
            frappe.set_route("facility-builder", frm.doc.name);
        });
    },
});
```

### Start screen (no facility in the route)

When the page opens **without** a facility name (route length 1), the controller renders a minimal **inline start screen** into the page body — not a popup:

- A **Link** control labelled *Facility* (Options: `Facility`, `only_select`) + an **Edit** button → `frappe.set_route("facility-builder", name)`.
- Any facility can be opened, including ones that have no structure yet.
- **New facilities are created through the Facility doctype**, not from this page (Facility has required fields incl. a required `links` table). The Facility form's "Open Facility Builder" button is the way back in.

The screen is wrapped in `padding: var(--padding-md)` / `max-width: 300px` to match the desk's standard field spacing. The controller also clears any chrome a previous builder session left on the page (`clear_primary_action`, `clear_actions`, `clear_menu`, `clear_indicator`) before drawing it.

---

## Component Tree

```
FacilityBuilder.vue        ← root: creates store, provides it, owns page-chrome bridge
├── SpacePalette.vue       ← Space Type catalog → draggable puzzle pieces (color swatches)
├── FloorTabs.vue          ← tabs from Floor Type records; sets the active floor
├── Toolbar.vue            ← scale (px/m) + grid inputs; selected-room actions
│                            (Convert to Polygon, Delete) + area readout
└── Canvas.vue             ← vue-konva Stage; renders rooms of the active floor;
    └── RoomShape.vue        owns the shape-aware Transformer (resize/rotate)
                           ← one Konva Rect or closed Line + label + vertex handles
```

Plain-JS helpers (not components): `store.js` (state), `utils.js` (geometry/area),
`colors.js` (`colorFor` palette + `resolveColor`).

State is shared via a composable store (`provide/inject`), not props-drilling — see [`../vue/pattern-lazy-bundle.md`](../vue/pattern-lazy-bundle.md) Step 4.

---

## The Store (Facility-specific shape)

```javascript
// butler/public/js/facility_builder/store.js  (sketch — full mechanics in pattern-lazy-bundle.md)
export function getStore(facility_name) {
    let facility   = ref(null);   // the Facility doc
    let design     = ref(null);   // parsed geometry envelope { version, scale, canvas, floors }
    let space_types = ref([]);    // Space Type catalog (name, space_name, color)
    let active_floor_type = ref(null);
    let selected_id = ref(null);
    let dirty      = ref(false);

    // computed: active_floor, selected_room, ppm, space_colors {type → color}

    function fetch() { /* load Facility doc → JSON.parse(geometry) → design; load space_types */ }
    function save_changes() { /* serialize design → geometry → save */ }
    // rooms:  add_room, update_room, delete_room, convert_to_polygon
    // floors: add_floor, remove_floor
    // canvas: set_scale (recomputes all areas), set_grid
}
```

`fetch` and `save_changes` are detailed in [persistence.md](persistence.md).

---

## Frappe ↔ Vue Bridge

Identical to Print Format Builder — direct method calls one way, Vue `watch()` the other (no CustomEvents):

| Direction | Mechanism |
|---|---|
| Frappe → Vue | Page primary action `Save` → `this.$component.$store.save_changes()` |
| Vue → Frappe | `watch(() => store.dirty, …)` flips the page's "Not Saved" indicator and toggles Reset/Save buttons |

The bundle class also calls `SetVueGlobals(app)` so templates get `frappe` and `__()`.

### Page chrome (buttons + breadcrumb)

Set by the bundle class on the Frappe `page`:

| Item | Placement | Action |
|---|---|---|
| **Save** | primary action | `store.save_changes()` |
| **Open Facility** | outside button (before the ⋯ menu) | routes to the Facility form |
| **Reset Changes** | outside button (shown only when dirty) | `store.reset_changes()` |
| **Change Facility** | under the ⋯ menu | back to the start screen |

**Breadcrumb:** the page controller re-registers a `Custom` breadcrumb (`label: "Facility Builder"`, `route: "facility-builder"`) in **`on_page_show`**. This is required because Frappe registers a page's breadcrumb only once, keyed by the full route string — a dynamic `facility-builder/<name>` sub-route would otherwise show no breadcrumb. (Same pattern as `print.js`.)

---

## Why a Page, Not a Form Island

- The canvas needs **full-width** real estate; a form tab is too cramped.
- It stays **document-scoped** (route carries the facility name) and saves through the normal `frappe.client.save` flow — no loss of permissions or session.
- Mirrors the reference implementation the whole feature is modeled on.
