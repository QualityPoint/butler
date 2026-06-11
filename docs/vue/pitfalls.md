# Common Pitfalls and Solutions

---

## 1. Vue packages installed inside `frontend/` instead of app root

**Symptom:** `bench build` fails with "Module not found" for Vue or third-party library imports.

**Root cause:** Frappe's esbuild looks for `node_modules/` at the app root. The `frontend/` directory is a completely separate Vite SPA — its `node_modules/` is invisible to the desk bundle build.

**Fix:**
```bash
cd frappe-bench/apps/[your-app]   # app ROOT, not frontend/
yarn add vue [your-library]
bench build --app [your-app]
```

---

## 2. `setTimeout(100)` is required in dashboard mount

**Symptom:** `document.getElementById(container_id)` returns `null` immediately after `frm.dashboard.add_section()`.

**Root cause:** `frm.dashboard.add_section()` schedules DOM insertion — the element does not exist synchronously in the same call stack tick.

**Fix:**
```javascript
frm.dashboard.add_section(`<div id="${container_id}"></div>`);

setTimeout(() => {
    const el = document.getElementById(container_id);
    if (el) window.YourDashboard.mount(el, data);
}, 100);  // Frappe's rendering cycle completes in < 50ms; 100ms is a safe buffer
```

This is not a race condition workaround — it is the correct pattern for `add_section()`.

---

## 3. Tailwind preflight breaks Frappe desk icons

**Symptom:** After adding Tailwind to `app_include_css`, navbar icons disappear, sidebar icons go missing, buttons lose styling.

**Root cause:** Tailwind's `@layer base` (preflight) resets SVG `fill` to `currentColor`. Frappe's icons rely on the browser's default SVG fill behavior.

**Fix:** Never add Tailwind to global CSS. Use a separate build and inject scoped only when needed:
```css
/* tailwind.css — utilities layer ONLY */
@import "tailwindcss/utilities";   /* no @import "tailwindcss" */
```
→ See [css-and-libraries.md](css-and-libraries.md#tailwind-css--safe-integration) for the full approach.

---

## 4. esbuild cannot process `@import "tailwindcss"` directly

**Symptom:** Build error — `Could not resolve "tailwindcss"`.

**Root cause:** Tailwind v4 syntax requires a special CSS processor. Frappe's esbuild does not have it.

**Fix:** Use the standalone Tailwind CLI to pre-compile:
```bash
yarn tw:build   # compiles tailwind.css → tailwind.output.css
```
Import `tailwind.output.css` (the compiled file), never the source.

---

## 5. `<style scoped>` does not apply to teleported modal content

**Symptom:** Styles defined in `<style scoped>` have no effect on content inside `<DialogPortal>` or `<Teleport to="body">`.

**Root cause:** Vue's scoped attribute (`data-v-...`) is only added to elements within the component's own template. Teleported content is mounted outside the component root — the attribute is not present.

**Fix:** Use global styles with unique, prefixed class names:
```vue
<style>
/* intentionally not scoped */
.[your-app]-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1050; }
.[your-app]-modal-content { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 1051; background: white; border-radius: 8px; }
</style>
```
The unique prefix (`[your-app]-`) prevents conflicts with Frappe's Bootstrap classes.
