# CSS Isolation and UI Libraries

## The Three CSS Contexts

Frappe's desk uses Bootstrap 4 globally. Without discipline, Vue island styles leak into Frappe's layout or vice versa.

| Context | Location | Scope |
|---|---|---|
| **Frappe Desk Global** | `public/css/[your-app].css` (via `app_include_css`) | All desk pages |
| **Vue Island Scoped** | `<style scoped>` in `.vue` files | Single component only |
| **Standalone SPA** | `frontend/` directory | Completely isolated, no interaction with desk |

---

## Vue Island Scoped Styles

Every Vue component should use `<style scoped>`. Vue's compiler adds a unique attribute (`data-v-xxxxxxxx`) to every template element and rewrites CSS selectors to match only those elements.

```vue
<style scoped>
.metric-card {
  padding: 24px;
  border-radius: 8px;
  /* compiles to: .metric-card[data-v-cf2dc327] { ... } */
  /* never leaks to Frappe's DOM or other components      */
}
</style>
```

**Exception — Teleport/Portal content:** `<style scoped>` does not apply to elements teleported outside the component root (e.g., `<DialogPortal>` from Radix Vue). For those, use global styles with unique prefixed class names to prevent conflicts:

```vue
<style>
/* intentionally not scoped — content is teleported to <body> */
.[your-app]-dialog-overlay { background: rgba(0,0,0,0.5); position: fixed; inset: 0; z-index: 1050; }
.[your-app]-dialog-content { background: white; border-radius: 8px; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1051; }
</style>
```

---

## Global Desk CSS

```css
/* public/css/[your-app].css */
/* ✅ Use for: app-wide font overrides, global utility classes, theme variables */
/* ❌ Avoid: component-specific layout, anything that could conflict with Bootstrap */
```

```python
# hooks.py
app_include_css = [
    "/assets/[your-app]/css/[your-app].css",
]
```

### Frappe's radius tokens

Frappe 16.51 (Espresso tokens) dropped `--border-radius`, `--border-radius-md`, `--border-radius-tiny`
and the rest without aliases, despite the comment in `espresso/_borders.scss`. An undefined
variable makes `border-radius` fall back to `0`, so every corner using one turned square. Use the
Espresso scale from `frappe/public/css/espresso/radius.css`, with a pixel fallback:

| Old | Use |
|---|---|
| `--border-radius-tiny` | `var(--radius-sm, 4px)` |
| `--border-radius` | `var(--radius, 8px)` |
| `--border-radius-md` | `var(--radius-md, 10px)` |
| `--border-radius-lg` | `var(--radius-lg, 12px)` |
| `--border-radius-full` | `var(--radius-full, 9999px)` |

---

## Tailwind CSS — Safe Integration

Tailwind cannot be imported directly in desk bundles. Two failure modes:

| Mistake | Symptom |
|---|---|
| `@import "tailwindcss"` in a bundle file | esbuild error: cannot resolve "tailwindcss" |
| Adding compiled Tailwind to `app_include_css` | Frappe icons disappear, forms unstyled |

The root cause of the second failure: Tailwind's `@layer base` (preflight) resets SVG `fill` to `currentColor`, breaking all of Frappe's SVG-based icons.

### The Correct Approach

Build Tailwind separately with its own CLI and inject it scoped to your island containers only.

**Step 1** — Create the Tailwind source file (utilities layer only):

```css
/* public/css/tailwind.css */
@import "tailwindcss/utilities";   /* NO base, NO preflight */
```

**Step 2** — Use build scripts (already in `package.json`):

```bash
yarn tw:build   # compile once
yarn tw:watch   # watch mode during development
```

**Step 3** — Do NOT add to `app_include_css`. Instead, inject scoped to the island:

```javascript
// in a Vue component that needs Tailwind utilities
import { onMounted } from 'vue'

onMounted(() => {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = '/assets/[your-app]/css/tailwind.output.css'
  document.querySelector('.[your-app]-island')?.appendChild(link)
})
```

---

## Radix Vue — Headless Components

[Radix Vue](https://www.radix-vue.com/) provides behavior-only primitives (Dialog, Sheet, Select, etc.) with no built-in CSS. Zero conflict risk with Frappe's Bootstrap.

```bash
cd frappe-bench/apps/[your-app]
yarn add radix-vue
```

### Usage

```vue
<script setup>
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogClose } from 'radix-vue'

defineProps({ isOpen: Boolean })
defineEmits(['close'])
</script>

<template>
  <DialogRoot :open="isOpen" @update:open="$emit('close')">
    <DialogPortal>
      <DialogOverlay class="[your-app]-dialog-overlay" />
      <DialogContent class="[your-app]-dialog-content">
        <!-- your content -->
        <DialogClose>Close</DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
/* not scoped — DialogPortal teleports to <body> */
.[your-app]-dialog-overlay {
  background: rgba(0, 0, 0, 0.5);
  position: fixed; inset: 0; z-index: 1050;
}
.[your-app]-dialog-content {
  background: white;
  border-radius: 8px; padding: 24px;
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1051; max-width: 500px; max-height: 80vh; overflow-y: auto;
}
</style>
```

**z-index note:** Frappe's modals use z-index ~1040. Use 1050–1060 for your island modals to render on top.

---

## Summary Checklist

| Rule | Reason |
|---|---|
| Always `<style scoped>` on Vue components | Prevents Bootstrap conflicts |
| Use prefixed class names for teleported content | Scoped styles don't reach teleport targets |
| Never `@import "tailwindcss"` in bundle files | esbuild cannot process it |
| Never add Tailwind to `app_include_css` | Preflight breaks Frappe icons |
| Use `@import "tailwindcss/utilities"` only | Safe subset — no resets |
| Install Radix Vue at app root | Frappe's esbuild needs packages there |
| z-index 1050+ for island modals | Renders above Frappe's own modals |
