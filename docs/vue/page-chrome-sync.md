# Desk Page Chrome Sync — Sidebar & Breadcrumb

> **Concern:** keeping Frappe's **page chrome** (the Workspace Sidebar's active
> item + the breadcrumb) in sync when the active route is a **custom desk Page**.
> This is a Frappe-owned surface (see the *Ownership Boundary* table in
> [README.md](README.md)) — Vue never touches it. But Frappe only auto-syncs it
> for **DocType** routes; custom Pages need the page controller to re-assert it.
> Applies to every Vue Island that lives on a custom Page ([pattern-page.md](pattern-page.md),
> [pattern-lazy-bundle.md](pattern-lazy-bundle.md)) — and to any non-Vue custom Page too.

---

## The Symptom

Navigate **to** a custom Page (from a form button, a link, or a reload) and the
desk sidebar doesn't follow: the wrong Workspace Sidebar stays shown, or the
right one shows but the page's item isn't highlighted. The breadcrumb may be
missing entirely. Navigating **to a DocType** form/list always syncs correctly —
that asymmetry is the tell.

---

## Why It Breaks (Frappe internals)

On every route change Frappe's sidebar runs a resolver to decide *which*
Workspace Sidebar to show and *which* item to light up
(`frappe/public/js/frappe/ui/sidebar/sidebar.js`). It keys off the route through
this chain — and each link is fragile for a Page:

1. **`entity_from_route(route)`** reads a **single route segment** as the "entity".
   - DocType route `["Form", "<DocType>", "<name>"]` → entity = `"<DocType>"` ✅ a real entity.
   - Page route `["<your-page>"]` → entity = `"<your-page>"` ✅ matches by `link_to` (below).
   - Page route **with sub-segments** `["<your-page>", "<a>", "<b>"]` → entity = `"<a>"` ❌
     that's *your* sub-route argument (a mode, an id…), which matches nothing.

2. **`get_workspace_sidebars(entity)`** finds sidebars whose item has
   `link_to === entity`. Works only when step 1 produced the page name verbatim.

3. **Module fallback `resolve_module_sidebar(module)`** — the safety net when
   steps 1–2 miss — returns a sidebar **only if the Page's module name equals the
   Workspace Sidebar's title**. For most apps these differ (e.g. module
   `HW Setup` vs sidebar `Hawya Setup`), so the net returns `null` and nothing switches.

Net effect: a custom Page can't reliably map itself to its Workspace Sidebar. A
DocType always can. **The fix is to stop relying on the resolver and pin the
chrome explicitly from the page controller.**

---

## The Fix — Required Steps

Two surfaces to re-assert, both owned by the **Frappe page controller**
(`[your-app]/page/[your-page]/[your-page].js`), never by Vue.

### Step 1 — Pin the sidebar in `on_page_show`

`on_page_show` runs *after* the resolver, so it gets the last word. Rebuild the
correct sidebar only when needed, then highlight the active item — `setup()`
rebuilds the DOM but does **not** highlight, so the second call is required.

```javascript
function sync_page_chrome() {
    // --- breadcrumb (Step 3) ---
    frappe.breadcrumbs.add({
        type: "Custom",
        label: __("[Page Title]"),
        route: "[your-page]",
    });

    // --- sidebar ---
    const sb = frappe.app?.sidebar;
    if (!sb) return;                                  // guard: very early load
    if (sb.sidebar_title !== "[Sidebar Title]") {
        sb.setup("[Sidebar Title]");                 // rebuild ONLY if not already shown
    }
    sb.set_active_workspace_item();                  // highlight this page's item
}

frappe.pages["[your-page]"].on_page_show = function (wrapper) {
    sync_page_chrome();
    load_[your_page](wrapper);                        // your existing mount call
};
```

> **`[Sidebar Title]`** is the `title` of the **Workspace Sidebar** doctype that
> lists this page (e.g. the record under `[your-app]/workspace_sidebar/*.json`
> whose `items[]` has `link_to: [your-page]`, `link_type: Page`). Hardcode it —
> a page belongs to exactly one sidebar.

### Step 2 — Hint the sidebar at navigation sites (no flash)

Step 1 corrects the chrome but can flash the wrong sidebar for a frame first.
Frappe's router honors an explicit hint and skips the resolver entirely, so set
it **right before** `set_route` wherever *you* trigger the navigation (form
buttons, custom links):

```javascript
frm.add_custom_button(__("Open [Your Page]"), () => {
    frappe.route_options = { sidebar: "[Sidebar Title]" };   // consumed by the router's change handler
    frappe.set_route("[your-page]" /* , ...sub-route args */);
});
```

Step 1 still matters: it covers reloads and deep-links, where no button ran.
Use **both** — Step 2 for a clean transition, Step 1 as the safety net.

### Step 3 — Re-register the breadcrumb in `on_page_show`

Frappe registers a page's breadcrumb **once**, keyed by the full route string, so
a Page that was never visited (or a dynamic sub-route) shows none. Re-adding it
on every show (folded into `sync_page_chrome` above) is the same pattern Frappe
core uses in `print.js`. Harmless to call repeatedly.

---

## Checklist

| Step | Where | Purpose |
|---|---|---|
| Pin sidebar (`setup` if needed + `set_active_workspace_item`) | page `on_page_show` | survives reload / deep-link |
| `frappe.route_options = { sidebar: … }` before `set_route` | every nav trigger you own | no first-frame flash |
| Re-register `Custom` breadcrumb | page `on_page_show` | breadcrumb on dynamic routes |

---

## Note — Pages With Sub-Routes

If a Page carries arguments in the route (`[your-page]/<mode>/<name>`), step 1 of
the resolver reads the **first argument** as the entity, which can never match —
so the sidebar hint (Step 2) and the `on_page_show` pin (Step 1) are **mandatory**,
not optional. The cleaner-but-larger alternative is to keep the route a single
segment and carry the arguments in `frappe.route_options` instead, so the entity
resolves natively; weigh that against the convenience of a shareable deep-link URL.

---

## Verify

1. Open the Page from a form button → its sidebar item is highlighted immediately.
2. **Reload** while on the Page (`/app/[your-page]/...`) → sidebar + breadcrumb still correct.
3. Open it from a form in a *different* workspace → sidebar switches to the page's own.
4. Leave to a DocType and back → no stale highlight.

These are desk-UI behaviors — verify in the browser; a `bench build` won't catch them.
