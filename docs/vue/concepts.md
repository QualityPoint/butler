# Concepts — Vue Islands Architecture

## What is a Vue Island?

A Vue Island is a standalone Vue 3 application mounted to a specific DOM container inside a Frappe page. Each island:

- Is independent — it manages its own state and lifecycle
- Communicates with the backend via `frappe.call()`
- Does not interfere with Frappe's global styles or other islands
- Is activated only when its host page or form loads — not on every desk navigation

Frappe's default UI (jQuery, server-rendered HTML) handles everything outside the island. Vue handles only what is inside it.

---

## Two Integration Patterns

This documentation covers two patterns. Choose based on your UI context.

### Pattern 1 — Doctype Dashboard Island

Embeds a Vue component inside a Frappe Doctype form, replacing the static dashboard section with reactive metric cards or visualizations.

```
Doctype Form
└── Dashboard Section
    └── <div id="vue-dashboard-[doc-name]">
        └── Vue App (metric cards, charts, etc.)
```

**Lifecycle:** mounts on `frm.refresh` / `after_save`, unmounts before re-mount.
**Communication:** `window.[YourDashboard].mount(container, data)` — factory pattern via `window.*` global because Frappe form controllers cannot import ES modules directly.

**Best for:** summary stats, metric cards, embedded visualizations tied to a single document.

→ See [pattern-dashboard.md](pattern-dashboard.md) for implementation.

---

### Pattern 2 — Full Custom Page Island

A complete Vue 3 app that takes over an entire Frappe custom page, used for UIs too complex for Frappe's default page tools (interactive graphs, node editors, map views, etc.).

```
Frappe Custom Page
└── page.main container
    └── <div id="[your-page]-vue-root">
        └── Vue App (root component + component tree)
```

**Lifecycle:** mounts on `on_page_load`, unmounts on `on_page_unload`.
**Communication:** `CustomEvent` bridge — the Frappe page controller dispatches browser events; the Vue bundle listens for them. This decouples the two without requiring ES module imports in the Frappe controller.

**Best for:** tree visualizations, canvas editors, map interfaces, dashboard pages with complex interactivity.

→ See [pattern-page.md](pattern-page.md) for implementation.

---

## The CustomEvent Bridge (Pattern 2 only)

Frappe page controllers (`frappe.pages['...'].on_page_load`) are plain scripts that cannot use `import`. Vue bundles use ES modules and cannot call Frappe page APIs. The bridge:

```
Frappe page controller                 Vue bundle (public/js/pages/)
        │                                       │
  on_page_load:                        addEventListener:
  dispatchEvent(                       '[your-page]-page-ready'
    '[your-page]-page-ready',          → mount app into container
    { detail: { container } }
  )
        │                                       │
  on_page_unload:                      addEventListener:
  dispatchEvent(                       '[your-page]-page-unload'
    '[your-page]-page-unload'          → unmount app
  )
```

No `window.*` globals, no `setTimeout`, no polling. The container DOM node is passed directly in the event `detail`.

---

## Performance Notes

- **Scoped styles** — all `.vue` files use `<style scoped>`. Vue adds a unique attribute (`data-v-xxxxxxxx`) to every element; CSS selectors become `[class][data-v-...]`. Nothing leaks into Frappe's global DOM.
- **Lazy activation** — Vue apps run only when their host form or page is open. All other desk pages are unaffected.
- **No global store** — neither pattern uses Vuex or Pinia. Data flows strictly through props and events, keeping each island self-contained.
- **Instance tracking** — for dashboards, keep a map of `{ [frm.doc.name]: app }`. Unmount the old instance before mounting a new one to prevent detached DOM nodes and duplicate watchers.
