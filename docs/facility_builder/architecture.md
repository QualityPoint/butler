# Architecture

Facility Builder is **Pattern 3** (lazy bundle + shared store) from [`../vue/pattern-lazy-bundle.md`](../vue/pattern-lazy-bundle.md), applied to the Facility doctype. Read that file for the generic mechanics; this file covers only what's specific to Facility Builder.

---

## Surface: a Page Launched From Two Forms

The builder is a standalone desk page. The route encodes the **mode** and **name**: `facility-builder/<mode>/<name>` (`mode ∈ {facility, quotation}`). It's launched from either the **Facility** form (facility mode) or the **Butler Quotation** form (quotation mode).

```
Facility form         ──[ "Open Facility Builder" ]──► set_route("facility-builder", "facility", name)
Butler Quotation form ──[ "Open Facility Builder" ]──► set_route("facility-builder", "quotation", name)
                                                                  │
facility-builder page ── frappe.require("facility_builder.bundle.js") ──► new frappe.ui.FacilityBuilder({ mode, name })
```

### Launch buttons

```javascript
// butler/butler/doctype/facility/facility.js  (facility mode)
frm.add_custom_button(__("Open Facility Builder"), () =>
    frappe.set_route("facility-builder", "facility", frm.doc.name));

// butler/butler/doctype/butler_quotation/butler_quotation.js  (quotation mode)
frm.add_custom_button(__("Open Facility Builder"), () =>
    frappe.set_route("facility-builder", "quotation", frm.doc.name));
```

In quotation mode the store loads the quotation, then loads `quotation.facility` (blueprint files only). In facility mode it loads the Facility directly and starts a blank design.

### Start screen (no name in the route)

When the page opens **without** a target (route length 1), the controller renders a minimal **inline start screen** — not a popup:

- A **Document Type** Link (`options: DocType`, filtered to `Facility` / `Butler Quotation`) + a **Document** Dynamic Link (`options: document_type`, label adapts to the chosen doctype) + an **Open** button → `set_route("facility-builder", <mode>, name)`.
- A **Facility** starts a new layout session (which may spawn a quotation); a **Butler Quotation** edits its existing layout (submitted/cancelled open **read-only**).
- New facilities/quotations are created from their own doctypes, not from this page.

The page controller also calls `frappe.facility_builder?.destroy?.()` at the top of `load_facility_builder` so switching sub-routes tears down the previous Vue app.

The screen is wrapped in `padding: var(--padding-md)` / `max-width: 300px` to match the desk's standard field spacing. The controller also clears any chrome a previous builder session left on the page (`clear_primary_action`, `clear_actions`, `clear_menu`, `clear_indicator`) before drawing it.

---

## Component Tree

```
FacilityBuilder.vue        ← root: creates store, provides it, owns page-chrome bridge
├── AmenityPalette.vue     ← Order Type / Bundle / Amenity-Category (MultiSelectList) filters
│                            → scrollable list of draggable amenities (avatar + name + category)
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
export function getStore(mode, target_name) {       // mode: "facility" | "quotation"
    const is_facility_mode = mode === "facility";
    let quotation = ref(null);    // the Butler Quotation doc (null in facility mode until saved)
    let facility  = ref(null);    // the Facility doc, loaded for blueprint files
    let design    = ref(null);    // parsed geometry envelope { version, scale, canvas, floors }
    let amenities  = ref([]);     // Amenity catalog (palette)
    let categories = ref([]);     // Amenity Category catalog (filters + colors)
    let bundle_limits = ref({});  // { category → amenity_count } for the active bundle
    let dependency_graph = ref({}); // { dependant amenity → [primary amenity, ...] }
    let order_type = ref("Amenities");
    let bundle_type = ref(null);
    let selected_categories = ref([]);   // MultiSelectList filter (ephemeral)
    let active_floor_type = ref(null);
    let selected_id = ref(null);
    let dirty = ref(false);

    // computed: active_floor, selected_room, ppm, read_only (docstatus ≠ 0),
    //           category_colors, amenity_index, available_categories,
    //           filtered_amenities, category_counts, category_is_full(cat),
    //           amenity_counts, dependency_shortfalls, has_dependency_shortfall
    //           + amenity_label(name), amenity_is_short(name), primaries_for(name)

    function fetch() { /* facility mode: load Facility, seed floors from blueprints, blank design. quotation mode: load quotation geometry + its facility */ }
    function save_changes() { /* facility mode → insert NEW draft quotation on ≥1 amenity + route to it. quotation mode → save geometry + order config + derived rows (block if read_only) */ }
    function save_facility() { /* persist blueprint-file rows (Facility.blueprints) */ }
    // rooms:  add_room (enforces bundle limit), update_room, delete_room, convert_to_polygon
    // floors: add_floor, remove_floor
    // canvas: set_scale (recomputes all areas), set_grid
}
```

`fetch` and `save_changes` are detailed in [persistence.md](persistence.md).

### Server endpoints the store calls

| When | Endpoint | For |
|---|---|---|
| `load_catalogs`, on open | `frappe.db.get_list("Amenity" / "Amenity Category")` | the palette |
| `load_catalogs`, on open | `butler_bundle.get_bundle_breakdown` | `bundle_limits` |
| `load_catalogs`, on open | `amenity.get_dependency_graph` | `dependency_graph` |
| `set_active_layer("features")`, lazily | `amenity.get_amenity_annexes` + `butler_quotation.get_amenity_options` | the Features panel |

The dependency graph is loaded **eagerly with the catalogues**, not lazily like the
Features payload: the warning has to work on every layer, and it needs the primaries'
names *before* any primary is placed — neither of which a placement-keyed lazy fetch can
supply. Only flagged amenities travel, so it is a handful of rows.

---

## Frappe ↔ Vue Bridge

Identical to Print Format Builder — direct method calls one way, Vue `watch()` the other (no CustomEvents):

| Direction | Mechanism |
|---|---|
| Frappe → Vue | Page primary action `Save` → `this.$component.$store.save_changes()` |
| Vue → Frappe | `watch(() => [store.dirty, store.read_only], …)` flips the page indicator and toggles Save/Reset (both hidden when `read_only`, with a gray "Read only" indicator) |

The bundle class also calls `SetVueGlobals(app)` so templates get `frappe` and `__()`.

### Page chrome (buttons + breadcrumb)

Set by the bundle class on the Frappe `page`:

| Item | Placement | Action |
|---|---|---|
| **Save** / **Create Quotation** | primary action | `store.save_changes()` — label is "Create Quotation" in facility mode; hidden when read-only |
| **Open Facility** / **Open Quotation** | outside button (before the ⋯ menu) | routes to the source form (Facility or Butler Quotation, by mode) |
| **Reset Changes** | outside button (shown only when dirty) | `store.reset_changes()` |
| **Change Facility** / **Change Quotation** | under the ⋯ menu | back to the start screen |

**Breadcrumb:** the page controller re-registers a `Custom` breadcrumb (`label: "Facility Builder"`, `route: "facility-builder"`) in **`on_page_show`**. This is required because Frappe registers a page's breadcrumb only once, keyed by the full route string — a dynamic `facility-builder/<name>` sub-route would otherwise show no breadcrumb. (Same pattern as `print.js`.)

---

## Why a Page, Not a Form Island

- The canvas needs **full-width** real estate; a form tab is too cramped.
- It stays **document-scoped** (route carries the facility name) and saves through the normal `frappe.client.save` flow — no loss of permissions or session.
- Mirrors the reference implementation the whole feature is modeled on.
