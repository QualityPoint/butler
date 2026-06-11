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
│   ├── store.js                       ← getStore(facility_name) + useStore()
│   ├── utils.js                       ← blank_design, snap, area math, bbox helpers
│   ├── colors.js                      ← colorFor palette + resolveColor
│   ├── blueprint.js                   ← load_blueprint (image / PDF via pdf.js / CAD guard)
│   ├── pdf.worker.min.js              ← PDF.js worker (static asset, version-matched)
│   └── components/                    ← all .vue components (import ../ for the JS modules)
│       ├── FacilityBuilder.vue        ← root component
│       ├── FloorTabs.vue
│       ├── SpacePalette.vue
│       ├── Toolbar.vue                ← layer selector + blueprint/drawing controls
│       ├── Footer.vue                 ← Scale + Grid
│       ├── Canvas.vue
│       └── RoomShape.vue
└── butler/
    ├── page/facility_builder/
    │   ├── facility_builder.js         ← page controller (frappe.require + instantiate)
    │   └── facility_builder.json       ← Page doctype, role-gated
    └── doctype/
        ├── facility/facility.js        ← add "Open Facility Builder" custom button
        └── space_type/space_type.json  ← add `color` (Color) field → run bench migrate
```

> After adding the `color` field to the **Space Type** doctype, run `bench --site <site> migrate` so the column is created before the builder queries it.

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
 "roles": [{ "role": "System Manager" }]
}
```

Adjust `roles` to whoever may design facilities (e.g. a Facility Manager role).

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

1. Open a saved Facility → click **Open Facility Builder** → page mounts.
2. Add a floor, drag a Space Type onto the canvas, move/resize it.
3. In the Toolbar, set the scale (`1 m = N px`) → room areas update.
4. Select a room → **Convert to Polygon** → drag a vertex; double-click an edge to add one, double-click a vertex to remove one. Rotate via the Transformer handle (snaps to 45°).
5. Set a **Color** on a Space Type record → reopen the builder: all rooms of that type use it.
6. **Save** → reopen the page: the design reloads pixel-perfect (from `geometry`).
