# Comparison & Sweet Spots — Islands Docs vs Frappe Core

This file compares the two integration styles documented in this folder:

- **The "Vue Islands" docs** (`pattern-dashboard.md`, `pattern-page.md`) — a decoupled, self-contained island approach.
- **Frappe core's own technique** (`pattern-lazy-bundle.md`) — what core actually ships for the Print Format Builder, Form Builder, and Workflow Builder.

It ends with the **sweet spot**: which ideas to keep from each when building the feature in Butler.

> The two are the _same underlying mechanism_ — a Vue 3 app `createApp().mount()`-ed into a DOM node owned by a Frappe page, compiled by Frappe's esbuild via `*.bundle.js` auto-discovery. They diverge on **loading**, **the controller↔Vue bridge**, and **state**.

---

## 1. Side-by-Side

| Dimension | Islands docs (Patterns 1 & 2) | Frappe core (`pattern-lazy-bundle.md`) |
|---|---|---|
| **Bundle registration** | `app_include_js` in `hooks.py` | Not registered; pulled by `frappe.require` |
| **When JS downloads** | **Every desk page** ("selective loading not supported") | **On demand**, only when the page opens |
| **Bundle organization** | Central aggregators (`dashboard.bundle.js`, `pages.bundle.js`) | One self-contained bundle per feature; the bundle _is_ the class |
| **Controller ↔ Vue bridge** | CustomEvent (page) / `window.*` factory + `setTimeout(100)` (dashboard) | Direct ES-module import → instantiate class → method calls + `watch()` |
| **Premise** | "Controllers can't `import`" | `frappe.require` resolves the bundle as a module — they can |
| **State management** | "No store — props + events only" | Shared store: composable (`provide/inject`) **or Pinia** |
| **Vue globals** | Not used | `SetVueGlobals(app)` injects `frappe` + `__` |
| **Teardown** | Explicit `unmount()` + instance map; cleanup on unload | Implicit — `$parent.empty()` then re-mount |
| **Styling** | Scoped + Tailwind (utilities, scoped) + Radix Vue | Scoped + Bootstrap + CSS variables |
| **Coupling** | Loosely coupled (island knows nothing of Frappe chrome) | Tightly coupled (class drives `page.*` directly) |
| **Best for** | Small dashboard cards; drop-in form/page widgets | Full-page builders, multi-panel editors |

### The premise that doesn't hold

The Islands docs are built on _"Frappe page controllers are plain scripts that cannot use `import`"_ — which is why they reach for CustomEvents and `window.*` globals. Core's four builders all do this instead:

```javascript
frappe.require("feature_builder.bundle.js").then(() => {
    new frappe.ui.FeatureBuilder({ ... });   // direct import, no bridge
});
```

The premise is true for code written _inline_ in a form/page `.js`. It is **false** once you route through a lazy-loaded bundle. That single fact removes the need for the entire CustomEvent / `window.*` / `setTimeout` apparatus.

### The rule that's wrong

`concepts.md` states _"neither pattern uses Vuex or Pinia."_ Frappe core's **Form Builder uses Pinia** (`createPinia()`, `app.use(pinia)`, `useStore()`), and the **Print Format Builder uses a hand-rolled composable store** shared via `provide/inject`. Core's actual convention for non-trivial UIs is **a real shared store**, not props-only.

---

## 2. Sweetest Points — What to Keep From Each

### From Frappe core (`pattern-lazy-bundle.md`)

1. **Lazy `frappe.require` loading.** The single best idea. Bundle downloads only when the page opens — zero tax on every other desk page. Strictly better than `app_include_js` for anything not needed globally.
2. **Direct ES-module import instead of a bridge.** No CustomEvent contract to keep in sync, no `window.*` global, no `setTimeout(100)` race guard. Fewer moving parts, easier to debug.
3. **A shared store via `provide/inject` (or Pinia).** Once a component tree has more than ~2 levels, props-drilling collapses. The store also centralizes the bridge to `frappe.model` / `frappe.client.save`.
4. **`SetVueGlobals(app)`.** One line buys `__()` translation and `frappe.*` inside every template. The Islands docs miss this.
5. **`watch()` as the state→chrome bridge.** Letting `store.dirty` flip the page's "Not Saved" indicator is an elegant way for reactive Vue state to drive the imperative Frappe page without coupling the components to it.

### From the Islands docs

1. **Explicit, instance-tracked teardown.** Core is sloppy here (`$parent.empty()` and hope). The Islands discipline — guard double-mount, `app.unmount()`, keep a `{ [name]: app }` map, clean up on unload — is the correct way to avoid detached DOM and zombie watchers. **Critical for dashboards** that re-mount on every `frm.refresh` / `after_save`.
2. **The CSS isolation playbook** (`css-and-libraries.md`). Core has nothing equivalent and this is the docs' strongest original contribution:
   - Tailwind **utilities-only**, compiled by a separate CLI, injected **scoped** to the island — never in `app_include_css` (preflight resets SVG `fill` and breaks every Frappe icon — a real, non-obvious landmine).
   - Radix Vue for headless behavior with zero Bootstrap conflict.
   - The `<style scoped>` + teleport gotcha → prefixed global class + z-index 1050+.
3. **Python API discipline** (`python-api.md`). Always unwrap `r.message`; `frappe.get_all`/`get_doc` (permission-respecting) vs `frappe.db` (bypass) called out explicitly; an `error` handler on every `frappe.call`.
4. **The decision tables** (Islands vs full SPA; which pattern). Great for onboarding.

### Where they conflict — who wins

| Tension | Winner | Why |
|---|---|---|
| Lazy `require` vs eager `app_include_js` | **Core** | Don't tax every desk page |
| Direct import vs CustomEvent/`window.*` | **Core** | The bridge solves a problem `require` already eliminates |
| Shared store vs props-only | **Depends** | Store for editors/multi-panel; props for a single leaf card |
| Implicit vs explicit unmount | **Islands** | Core's is a latent memory leak |

---

## 3. The Recommended Hybrid for Butler

For a full-page builder-style feature, combine them like this:

- **Load** like core — lazy `frappe.require("feature.bundle.js")` in `on_page_show`; one bundle per feature; **not** in `app_include_js`.
- **Bridge** like core — import the bundle as a module, instantiate a class, drive the page chrome with `watch()`. No CustomEvents.
- **Bootstrap** like core — always `SetVueGlobals(app)`.
- **State** like core — composable store + `provide/inject` for a focused editor; Pinia once it grows. (Ignore the "no store" rule.)
- **Tear down** like Islands — explicit `app.unmount()` + an instance reference; unmount before re-mount, and on `on_page_unload`. (Patch core's gap.)
- **Style** like Islands — scoped by default; Tailwind utilities-only injected scoped; Radix for headless; the z-index/teleport rules.
- **Backend** like Islands — `r.message`, permission-aware queries, error handlers on every call.

**One line:** _Core's loading and wiring, Islands' lifecycle hygiene and CSS/backend discipline._

### Picking a pattern per surface

```
Is the Vue UI a small widget embedded in an existing form/page?
├── Yes, tied to one document's dashboard area
│       → Pattern 1 (dashboard island) + explicit teardown
├── Yes, but its own full custom page, simple, no shared backend state
│       → Pattern 2 (page island) — BUT prefer frappe.require over CustomEvents
└── No — it's a full-page builder/editor with multiple panels & shared state
        → Pattern 3 (lazy bundle + shared store)   ← the core technique
```

For the feature you're about to build in Butler (a builder-style page), **Pattern 3 is the starting point**, with the Islands teardown and CSS rules folded in.

---

## 4. Minimal Teardown Patch for Pattern 3

Core's one real weakness, fixed. In the bundle class, keep the app reference and add an unmount hook the page controller can call:

```javascript
// in the FeatureBuilder class (feature_builder.bundle.js)
this.app = createApp(FeatureBuilderComponent, { record_name: record });
SetVueGlobals(this.app);
this.$component = this.app.mount(this.$wrapper.get(0));

destroy() {
    this.app?.unmount();
    this.app = null;
}
```

```javascript
// in the page controller (feature_builder.js)
frappe.pages["feature-builder"].on_page_hide = function () {
    frappe.feature_builder?.destroy?.();
    frappe.feature_builder = null;
};
```

This gives you core's lazy load + direct wiring **and** the Islands docs' clean lifecycle — the actual sweet spot.
