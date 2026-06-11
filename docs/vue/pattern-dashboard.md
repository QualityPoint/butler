# Pattern 1 — Doctype Dashboard Island

Embeds a Vue component inside a Frappe Doctype form's dashboard area. The component replaces the static `frm.dashboard.add_section()` HTML with a reactive, prop-driven UI.

---

## Files Involved

```
[your-app]/doctype/[your-doctype]/
├── [your-doctype].js              ← Frappe form controller — triggers mount/unmount
├── [your-doctype]_dashboard.js    ← Vue app factory — exposes window.[YourDashboard]
├── [your-doctype]_dashboard.vue   ← Vue component
└── [your-doctype]_dashboard.py    ← Python API — returns dashboard data

[your-app]/public/js/
└── dashboard.bundle.js            ← Imports the factory (central aggregator)
```

---

## Data Flow

```
frm.refresh / after_save
        │
        ▼
frappe.call → [your-doctype]_dashboard.py → database
        │
        ▼  r.message (metrics dict)
frm.dashboard.add_section(<div id="vue-dashboard-[name]">)
        │
        ▼
window.[YourDashboard].mount(container, data)
        │
        ▼
createApp([YourDashboard], { ...props }).mount(container)
        │
        ▼
Vue renders reactively
```

---

## Step 1 — Vue Component

```vue
<!-- [your-doctype]_dashboard.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  metricA: Number,
  metricB: Number,
  metricC: String,
  // define one prop per value returned from Python
})

const subtitle = computed(() => `${props.metricA} total · ${props.metricB} active`)
</script>

<template>
  <div class="vue-dashboard-metrics mb-4">
    <div class="row">
      <div class="col-sm-6 px-2">
        <div class="metric-card metric-card-blue">
          <div class="metric-label text-muted text-uppercase">Metric A</div>
          <div class="metric-value">{{ metricA }}</div>
          <div class="metric-subtitle text-muted">{{ subtitle }}</div>
        </div>
      </div>
      <!-- add more cards as needed -->
    </div>
  </div>
</template>

<style scoped>
.metric-card {
  padding: 24px;
  background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}
.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.metric-card-blue { border-left: 5px solid #2490ef; }
.metric-value { font-size: 2rem; font-weight: 700; }
</style>
```

**Key points:**
- `<script setup>` (Vue 3 Composition API)
- Props receive values directly from `createApp(Component, props)` — no store needed
- `<style scoped>` prevents any leakage into Frappe's global styles
- Bootstrap classes (`row`, `col-sm-6`) work because Frappe provides them globally

---

## Step 2 — Factory Module

The factory exposes a `window.*` global because Frappe form controllers are plain scripts that cannot import ES modules.

```javascript
// [your-doctype]_dashboard.js
import { createApp } from 'vue';
import YourDashboard from './[your-doctype]_dashboard.vue';

function mount(container, data) {
    if (!container) return null;

    const app = createApp(YourDashboard, {
        metricA: data.metric_a || 0,
        metricB: data.metric_b || 0,
        metricC: data.metric_c || '',
        // map snake_case Python keys → camelCase Vue props
    });

    app.mount(container);
    return app;
}

function unmount(app) {
    app?.unmount();
}

window.YourDashboard = { mount, unmount };
```

---

## Step 3 — Python API

```python
# [your-doctype]_dashboard.py
import frappe

@frappe.whitelist()
def get_dashboard_data(docname):
    if not docname:
        return {}

    # fetch your data — frappe.get_all() respects user permissions
    rows = frappe.get_all(
        "[Child DocType]",
        filters={"parent": docname},
        fields=["field_a", "field_b"]
    )

    return {
        "metric_a": len(rows),
        "metric_b": sum(r.get("field_b") or 0 for r in rows),
        "metric_c": rows[-1]["field_a"] if rows else "",
    }
```

**Key points:**
- `@frappe.whitelist()` makes the method callable from the client
- Return a plain dict — Frappe serializes it to JSON automatically
- Use `frappe.get_all()` so Frappe's permission system applies

---

## Step 4 — Form Controller

```javascript
// [your-doctype].js
let _dashboard_instances = {};

frappe.ui.form.on("[Your Doctype]", {
    refresh(frm) {
        if (!frm.is_new()) frm.trigger("render_dashboard");
    },

    after_save(frm) {
        if (!frm.is_new()) frm.trigger("render_dashboard");
    },

    render_dashboard(frm) {
        // unmount previous instance (form re-renders on every save)
        if (_dashboard_instances[frm.doc.name]) {
            window.YourDashboard.unmount(_dashboard_instances[frm.doc.name]);
            _dashboard_instances[frm.doc.name] = null;
        }

        frm.dashboard.reset();

        frappe.call({
            method: '[your-app].[your-app].doctype.[your-doctype].[your-doctype]_dashboard.get_dashboard_data',
            args: { docname: frm.doc.name },
            callback(r) {
                if (!r.message) return;

                const container_id = 'vue-dashboard-' + frm.doc.name.replace(/[^a-zA-Z0-9]/g, '-');
                frm.dashboard.add_section(`<div id="${container_id}" style="min-height:150px;"></div>`);

                // setTimeout waits one tick for Frappe to flush add_section() into the DOM
                setTimeout(() => {
                    const el = document.getElementById(container_id);
                    if (el && window.YourDashboard) {
                        _dashboard_instances[frm.doc.name] = window.YourDashboard.mount(el, r.message);
                    }
                }, 100);
            }
        });
    },
});
```

**Why `setTimeout(100)`:** `frm.dashboard.add_section()` schedules a DOM insertion — the element does not exist synchronously. 100 ms is a safe buffer for Frappe's rendering cycle to complete. See [pitfalls.md](pitfalls.md) for details.

---

## Step 5 — Register in Bundle

```javascript
// [your-app]/public/js/dashboard.bundle.js
import '../../[your-app]/doctype/[your-doctype]/[your-doctype]_dashboard.js';
```

---

## Step 6 — Build and Test

```bash
bench build --app [your-app] --hard-link
```

1. Open a `[Your Doctype]` document — dashboard should appear.
2. Save the document — dashboard refreshes with updated data.
3. Open a second document in a new tab — separate instance, no interference.
