# Pattern 3 — Lazy Bundle + Shared Store (Frappe Core's Own Technique)

This is the pattern Frappe core uses for **every** one of its Vue builders — the Print Format Builder, Form Builder, and Workflow Builder. It is the production-proven approach, and it is **not** documented in `pattern-dashboard.md` or `pattern-page.md`. It differs from those two on the three things that matter most: **how the bundle loads**, **how the Frappe controller talks to Vue**, and **how state is shared**.

Reference implementations (read these directly, they are the source of truth):

- `frappe/printing/page/print_format_builder_beta/` — the page controller
- `frappe/public/js/print_format_builder/` — the Vue bundle, store, and components
- `frappe/public/js/form_builder/` — same pattern, but with **Pinia** instead of a hand-rolled store

---

## The Core Idea

The two patterns in `pattern-page.md` and `pattern-dashboard.md` are built on one premise:

> "Frappe page controllers are plain scripts that cannot use `import`, so we bridge with CustomEvents (pages) or `window.*` globals (dashboards)."

**Frappe core sidesteps this premise entirely.** A Frappe controller _can_ pull in an ES module — through `frappe.require()`. Once you have the module, you instantiate its class directly and hold a reference to the mounted Vue instance. No CustomEvent. No `window.*` factory. No `setTimeout` guesswork.

```
Frappe page controller                         Vue bundle (ES module)
        │                                               │
  on_page_show:                                         │
  frappe.require("feature.bundle.js")  ───────────────► loads & caches the module
        │  .then(() => {                                │
        │     new frappe.ui.FeatureBuilder({...})  ───► createApp().mount()
        │  })                                           │
        │                                               │
  page.set_primary_action("Save",                       │
     () => this.$component.$store.save())  ───────────► direct method call
        │                                               │
  watch(() => $component.$store.dirty, ...)  ◄────────── reactive state pushed back
                                                          to page chrome
```

The bundle downloads **only when the page is actually opened** (lazy), and the two sides communicate through **direct method calls + Vue `watch()`** (tightly coupled, but simple and debuggable).

---

## Files Involved

```
butler/
├── public/js/
│   └── feature_builder/
│       ├── feature_builder.bundle.js   ← entry: the class that boots Vue
│       ├── FeatureBuilder.vue          ← root component
│       ├── store.js                    ← composable store (provide/inject)
│       ├── utils.js                    ← pure helpers
│       └── *.vue                       ← child components
└── butler/
    └── page/feature_builder/
        ├── feature_builder.js          ← Frappe page controller
        ├── feature_builder.json        ← Page doctype (role-gated)
        └── feature_builder.py          ← optional whitelisted endpoints
```

> **Important — no `app_include_js`.** Unlike Patterns 1 & 2, this bundle is **NOT** registered in `hooks.py`. It is discovered by `bench build` (any `*.bundle.js` is an esbuild entry point) and pulled in on demand by `frappe.require`. It costs nothing on pages that don't open it.

---

## Step 1 — The Page Controller (lazy load + direct instantiation)

Modeled on `frappe/printing/page/print_format_builder_beta/print_format_builder_beta.js`.

```javascript
// butler/butler/page/feature_builder/feature_builder.js

frappe.pages["feature-builder"].on_page_load = function (wrapper) {
    frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Feature Builder"),
        single_column: true,
    });

    // dev-only hot reload — re-mount on bundle change
    if (frappe.boot.developer_mode) {
        frappe.hot_update = frappe.hot_update || [];
        frappe.hot_update.push(() => load_feature_builder(wrapper));
    }
};

frappe.pages["feature-builder"].on_page_show = function (wrapper) {
    load_feature_builder(wrapper);
};

function load_feature_builder(wrapper) {
    let route = frappe.get_route();        // ["feature-builder", "<record-name>"]
    let $parent = $(wrapper).find(".layout-main-section");
    $parent.empty();                       // clear before (re-)mount

    if (route.length > 1) {
        // ES MODULE IMPORT — the key move. No CustomEvent, no window.* bridge.
        frappe.require("feature_builder.bundle.js").then(() => {
            frappe.feature_builder = new frappe.ui.FeatureBuilder({
                wrapper: $parent,
                page: wrapper.page,
                record: route[1],
            });
        });
    } else {
        // no record in route → show a create/edit picker dialog, then
        // frappe.set_route("feature-builder", name) to re-enter with a record
    }
}
```

Key points:

- `frappe.require("...bundle.js")` resolves and **caches** the compiled module. Subsequent opens don't re-download.
- Mounting happens in `on_page_show` (fires every time the page is shown), and `$parent.empty()` clears the previous mount. `on_page_load` only wires the dev hot-reload hook.
- The route's second segment carries the record name — this is Frappe's native routing, not custom routing.

---

## Step 2 — The Bundle Entry: a Class That Boots Vue

This file **is** the bundle. It is a plain JS class that does the `createApp().mount()` and exposes itself on `frappe.ui.*`. Modeled on `frappe/public/js/print_format_builder/print_format_builder.bundle.js`.

```javascript
// butler/public/js/feature_builder/feature_builder.bundle.js

import { createApp, watch } from "vue";
import FeatureBuilderComponent from "./FeatureBuilder.vue";

class FeatureBuilder {
    constructor({ wrapper, page, record }) {
        this.$wrapper = $(wrapper);
        this.page = page;
        this.record = record;

        // --- own the Frappe page chrome (imperative side) ---
        this.page.clear_actions();
        this.page.clear_icons();
        this.page.clear_custom_actions();

        this.page.set_title(__("Editing {0}", [this.record]));
        this.page.set_primary_action(__("Save"), () => {
            this.$component.$store.save_changes();         // Frappe → Vue: direct call
        });
        let $preview_btn = this.page.add_button(__("Show Preview"), () => {
            this.$component.toggle_preview();
        });
        let $reset_btn = this.page.add_button(__("Reset Changes"), () =>
            this.$component.$store.reset_changes()
        );

        // --- boot Vue (reactive side) ---
        let app = createApp(FeatureBuilderComponent, { record_name: record });
        SetVueGlobals(app);                                // inject `frappe` + `__`
        this.$component = app.mount(this.$wrapper.get(0));

        // --- Vue → Frappe: reactive state drives the page chrome ---
        watch(
            () => this.$component.$store.dirty,
            (dirty) => {
                if (dirty.value) {
                    this.page.set_indicator(__("Not Saved"), "orange");
                    $preview_btn.hide();
                    $reset_btn.show();
                } else {
                    this.page.clear_indicator();
                    $preview_btn.show();
                    $reset_btn.hide();
                }
            },
            { deep: true }
        );

        watch(
            () => this.$component.show_preview,
            (value) => $preview_btn.text(value ? __("Hide Preview") : __("Show Preview"))
        );
    }
}

frappe.provide("frappe.ui");
frappe.ui.FeatureBuilder = FeatureBuilder;
export default FeatureBuilder;
```

This is the whole bridge: **method calls one way, `watch()` the other.** The `SetVueGlobals(app)` line (defined in Frappe's `libs.bundle.js`) injects `frappe` and `__` as Vue `globalProperties`, so every template can call `__("...")` and `frappe.*`. The dashboard/page patterns in this folder omit this — add it.

---

## Step 3 — The Root Component (creates + provides the store)

Modeled on `frappe/public/js/print_format_builder/PrintFormatBuilder.vue`.

```vue
<!-- butler/public/js/feature_builder/FeatureBuilder.vue -->
<template>
  <div v-if="shouldRender" style="display: flex; width: 100%">
    <div style="padding: var(--padding-md)">
      <Controls />
    </div>
    <div class="feature-container">
      <KeepAlive>
        <component :is="Preview" v-if="show_preview" />
        <component :is="Editor" v-else />
      </KeepAlive>
    </div>
  </div>
</template>

<script setup>
import Editor from "./Editor.vue";
import Preview from "./Preview.vue";
import Controls from "./Controls.vue";
import { getStore } from "./store";
import { computed, ref, onMounted, provide } from "vue";

const props = defineProps(["record_name"]);

let show_preview = ref(false);

// one store instance, keyed to this record
let $store = computed(() => getStore(props.record_name));

let shouldRender = computed(() =>
    Boolean($store.value.record.value && $store.value.meta.value)
);

// PROVIDE the store to the whole subtree
provide("$store", $store.value);

function toggle_preview() {
    show_preview.value = !show_preview.value;
}

onMounted(() => {
    $store.value.fetch();
});

// expose to the bundle class (Step 2 calls these via this.$component.*)
defineExpose({ toggle_preview, $store });
</script>

<style scoped>
.feature-container {
    height: calc(100vh - 95px);
    width: 100%;
    overflow-y: auto;
}
</style>
```

`defineExpose({ toggle_preview, $store })` is what makes `this.$component.toggle_preview()` and `this.$component.$store` work from the bundle class. This is the explicit, typed alternative to CustomEvents.

---

## Step 4 — The Store (composable, provide/inject)

Frappe core has **two** store flavors. Pick one:

### Option A — Hand-rolled composable (Print Format Builder)

Modeled on `frappe/public/js/print_format_builder/store.js`. No dependency; a function returning `ref`s + methods.

```javascript
// butler/public/js/feature_builder/store.js
import { watch, ref, inject, computed, nextTick } from "vue";

export function getStore(record_name) {
    let record = ref(null);
    let meta = ref(null);
    let dirty = ref(false);

    function fetch() {
        return new Promise((resolve) => {
            frappe.model.clear_doc("Butler Feature", record_name);
            frappe.model.with_doc("Butler Feature", record_name, () => {
                let doc = frappe.get_doc("Butler Feature", record_name);
                frappe.model.with_doctype(doc.doc_type, () => {
                    meta.value = frappe.get_meta(doc.doc_type);
                    record.value = doc;
                    nextTick(() => (dirty.value = false));
                    resolve();
                });
            });
        });
    }

    function save_changes() {
        frappe.dom.freeze(__("Saving..."));
        frappe
            .call("frappe.client.save", { doc: record.value })
            .then(() => fetch())
            .always(() => frappe.dom.unfreeze());
    }

    function reset_changes() {
        return fetch();
    }

    watch(record, () => (dirty.value = true), { deep: true });

    return { record, meta, dirty, fetch, save_changes, reset_changes };
}

// children call this instead of inject() directly
export function useStore() {
    let store = ref(inject("$store"));
    let record = computed(() => store.value.record);
    let meta = computed(() => store.value.meta);
    return { record, meta, store };
}
```

Children consume it:

```vue
<script setup>
import { useStore } from "./store";
const { record, meta, store } = useStore();
// store.value.save_changes(), record.value.some_field, ...
</script>
```

### Option B — Pinia (Form Builder)

Frappe's Form Builder uses real Pinia — which **contradicts the "no Pinia" rule in `concepts.md`**. Core embraces a store for non-trivial trees. The bundle wires it like this (`frappe/public/js/form_builder/form_builder.bundle.js`):

```javascript
import { createPinia } from "pinia";
import { useStore } from "./store";

let pinia = createPinia();
let app = createApp(FormBuilderComponent);
SetVueGlobals(app);
app.use(pinia);
this.store = useStore();   // now usable from the class AND from components
app.mount(this.$wrapper.get(0));
```

**When to use which:** hand-rolled for a focused single-record editor; Pinia when you have many components, multiple stores, or want devtools/time-travel. Both are "a real shared store," which is the actual core convention — _not_ props-only.

---

## Step 5 — Registering Many Components (optional)

For builders with dozens of field controls, core registers them globally so templates can do `<component :is="fieldtype + 'Control'" />`. See `frappe/public/js/form_builder/globals.js`:

```javascript
export function registerGlobalComponents(app) {
    app.component("DataControl", DataControl)
       .component("LinkControl", LinkControl)
       // ...one per fieldtype
}
```

Called in the bundle right after `createApp`: `registerGlobalComponents(app)`.

---

## Step 6 — Islands Within Islands (Vue inside a Frappe Dialog)

A nice trick from `frappe/public/js/print_format_builder/Field.vue`: a Vue component can open a **Frappe Dialog** and mount **another** Vue app into one of the dialog's field wrappers:

```javascript
let dialog = new frappe.ui.Dialog({
    fields: [{ fieldtype: "HTML", fieldname: "columns_area" }],
    on_page_show: () => {
        const app = createApp(ConfigureColumns, { df: props.df });
        SetVueGlobals(app);
        app.mount(dialog.get_field("columns_area").$wrapper.get(0));
    },
});
dialog.show();
```

This lets you reuse Frappe's dialog chrome (title, primary action, footer) while rendering rich Vue inside it.

---

## Step 7 — Page Definition & Build

The page is a standard Frappe **Page** doctype, role-gated (see `print_format_builder_beta.json`):

```json
{
 "doctype": "Page",
 "name": "feature-builder",
 "page_name": "Feature Builder",
 "module": "Butler",
 "standard": "Yes",
 "roles": [{ "role": "System Manager" }]
}
```

Build:

```bash
bench build --app butler --hard-link    # dev: changes reflect on reload
# or
bench build --app butler                # full build
```

`bench build` auto-discovers `feature_builder.bundle.js`, compiles the `.vue` SFCs via `esbuild-plugin-vue3` + Frappe's `frappe-vue-style` plugin, and emits to `public/dist/js/`. `frappe.require` then resolves that compiled artifact at runtime.

---

## Why This Pattern (vs Patterns 1 & 2)

- **Lazy by construction** — JS ships only to users who open the page, not to every desk navigation.
- **No bridge ceremony** — direct import means no CustomEvent contracts or `window.*` globals to keep in sync.
- **A real shared store** — `provide/inject` (or Pinia) scales to complex multi-panel UIs where props-drilling collapses.
- **Battle-tested** — this is exactly what core ships for its three most complex desk UIs.

The trade-off: the bundle class is **tightly coupled** to the Frappe page (it manipulates `page.*` directly). That is fine for a full-page builder; it is the wrong choice for a tiny dashboard card, where Pattern 1's prop-driven island is lighter. See `comparison.md` for when to reach for which.
