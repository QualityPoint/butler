# Setup & Build

Only Facility-Builder-specific setup is here. For the general desk-bundle/esbuild rules, see [`../vue/setup.md`](../vue/setup.md).

---

## Packages (install at app root)

Frappe's esbuild resolves `node_modules/` at the **app root**, not `frontend/`.

```bash
cd frappe-bench/apps/butler
yarn add vue konva vue-konva
yarn add pdfjs-dist@3.11.174    # PDF blueprints — pin v3 (see note)
```

- `vue` — provided by Frappe at runtime, but add it so esbuild resolves imports.
- `konva` — the 2D canvas engine.
- `vue-konva` — the Vue 3 binding (`<v-stage>`, `<v-layer>`, `<v-rect>`, …).
- `pdfjs-dist` — renders PDF blueprints to a canvas.

> **Pin pdfjs-dist to v3 (`legacy/build`).** Frappe's esbuild targets **es2017**; pdf.js v4+ uses `for-await`/`import.meta` which es2017 can't transform (build fails). The v3 **legacy** build is transpiled below that. Import it as `pdfjs-dist/legacy/build/pdf`.

### PDF.js worker (static asset)

The worker can't be bundled; host it and point `workerSrc` at it:

```bash
cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js \
   butler/public/js/facility_builder/pdf.worker.min.js
```

`blueprint.js` sets `GlobalWorkerOptions.workerSrc = "/assets/butler/js/facility_builder/pdf.worker.min.js"`. The file's version **must match** the installed `pdfjs-dist` — recopy it whenever you upgrade.

Register the binding once in the bundle entry:

```javascript
import VueKonva from "vue-konva";
let app = createApp(FacilityBuilderComponent, { facility });
SetVueGlobals(app);
app.use(VueKonva);
this.$component = app.mount(this.$wrapper.get(0));
```

---

## Files to Create

```
butler/
├── public/js/facility_builder/
│   ├── facility_builder.bundle.js     ← entry: class that boots Vue (frappe.ui.FacilityBuilder)
│   ├── store.js                       ← getStore(mode, name) + useStore()
│   ├── utils.js                       ← blank_design, snap, area math, bbox helpers
│   ├── colors.js                      ← colorFor palette + resolveColor
│   ├── blueprint.js                   ← load_blueprint (image / PDF via pdf.js / CAD guard)
│   ├── pdf.worker.min.js              ← PDF.js worker (static asset, version-matched)
│   └── components/                    ← all .vue components (import ../ for the JS modules)
│       ├── FacilityBuilder.vue        ← root component
│       ├── FloorTabs.vue
│       ├── AmenityPalette.vue         ← Order Type / Bundle / Amenity-Category filters + amenity list
│       ├── Toolbar.vue                ← layer selector + blueprint/drawing controls
│       ├── Footer.vue                 ← Scale + Grid
│       ├── Canvas.vue
│       └── RoomShape.vue
└── butler/
    ├── page/facility_builder/
    │   ├── facility_builder.js         ← page controller (frappe.require + instantiate)
    │   └── facility_builder.json       ← Page doctype, role-gated (Sales User/Manager)
    └── doctype/
        ├── facility/facility.js                     ← "Open Facility Builder" → facility mode
        ├── butler_quotation/butler_quotation.js     ← "Open Facility Builder" → quotation mode
        ├── butler_quotation/butler_quotation.json   ← `geometry` (Code/JSON, hidden, read-only, no-copy)
        ├── butler_quotation_item/…json              ← `floor_type` (Link→Floor Type, reqd)
        └── amenity_category/amenity_category.json   ← `color` (Color) field → run bench migrate
```

> After adding the `geometry` field (Butler Quotation) and `color` field (Amenity Category), run `bench --site <site> migrate` so the columns exist before the builder queries them.

> **Not** registered in `app_include_js`. The bundle is discovered by `bench build` and pulled in lazily by `frappe.require` only when the page opens. See [architecture.md](architecture.md).

---

## Page Doctype

```json
{
 "doctype": "Page",
 "name": "facility-builder",
 "page_name": "Facility Builder",
 "module": "Butler",
 "standard": "Yes",
 "roles": [{ "role": "Sales User" }, { "role": "Sales Manager" }]
}
```

Adjust `roles` to whoever may lay out quotations.

---

## Build

```bash
bench build --app butler --hard-link    # dev — reflects on reload
# or
bench build --app butler                # full build
bench clear-cache && bench restart      # if changes don't appear
```

`bench build` auto-discovers `facility_builder.bundle.js`, compiles the `.vue` SFCs (`esbuild-plugin-vue3` + Frappe's `frappe-vue-style`), and emits to `public/dist/js/` — which `frappe.require` then loads.

---

## Smoke Test

1. **Facility mode:** open a **Facility** → **Open Facility Builder**. Add a floor; pick an **Order Type / Bundle / Amenity Categories** filter; drag **Amenities** from the list onto the canvas across two floors.
2. Set the scale (`1 m = N px`) → room areas update. Convert a room to **Polygon**; edit vertices; rotate (snaps 45°).
3. Click **Create Quotation** → a new draft **Butler Quotation** is inserted and the builder routes to it. Its `amenities` table holds distinct **(amenity + floor_type)** rows with `qty` = placement counts.
4. **Quotation mode:** reopen that quotation in the builder → the layout reloads pixel-perfect (from `geometry`); edit and **Save**.
5. Set a **Color** on an Amenity Category record → reopen: all rooms of that category use it.
6. Submit the quotation → reopen the builder: it loads **read-only** (Save hidden, "Read only" indicator).
