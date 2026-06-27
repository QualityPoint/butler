# Pattern 2 — Full Custom Page Island

A complete Vue 3 app that takes over a Frappe custom page. The Frappe page controller creates a container and signals the Vue bundle via a `CustomEvent`. The Vue bundle mounts and unmounts the app in response.

---

## Files Involved

```
[your-app]/page/[your-page]/
├── [your-page].js            ← Frappe page controller — creates container, fires events
└── components/
    ├── Page.vue              ← Root Vue component
    └── *.vue                 ← Child components

[your-app]/public/js/
├── pages/
│   └── [your-page].js       ← Vue lifecycle manager — listens for events, mounts/unmounts
└── pages.bundle.js          ← Imports the lifecycle manager
```

---

## The CustomEvent Bridge

Frappe page controllers are plain scripts (no ES module imports). Vue bundles use ES modules (no access to Frappe page APIs). They communicate through browser `CustomEvent`s:

```
Frappe page controller                 Vue lifecycle manager
        │                                       │
  on_page_load:                         addEventListener:
  dispatchEvent(                        '[your-page]-page-ready'
    '[your-page]-page-ready',           → mount(e.detail.container)
    { detail: { container } }
  )
        │                                       │
  on_page_unload:                       addEventListener:
  dispatchEvent(                        '[your-page]-page-unload'
    '[your-page]-page-unload'           → unmount()
  )
```

---

## Step 1 — Frappe Page Controller

```javascript
// [your-app]/page/[your-page]/[your-page].js

frappe.pages['[your-page]'].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: '[Your Page Title]',
        single_column: true
    });

    const container = document.createElement('div');
    container.id = '[your-page]-vue-root';
    // full-height canvas: subtract Frappe's navbar + breadcrumb (~140px)
    container.style.cssText = 'height: calc(100vh - 140px); width: 100%; overflow: hidden;';

    page.main.append(container);

    document.dispatchEvent(new CustomEvent('[your-page]-page-ready', { detail: { container } }));
};

frappe.pages['[your-page]'].on_page_unload = function () {
    document.dispatchEvent(new CustomEvent('[your-page]-page-unload'));
};
```

> **Page chrome is the controller's job too.** Frappe doesn't reliably sync the
> Workspace Sidebar + breadcrumb for a custom Page — re-assert them from this
> controller's `on_page_show`. See [page-chrome-sync.md](page-chrome-sync.md).

---

## Step 2 — Vue Lifecycle Manager

```javascript
// [your-app]/public/js/pages/[your-page].js

import { createApp } from 'vue';
import Page from '../../../[your-app]/page/[your-page]/components/Page.vue';

let app = null;

function mount(container) {
    if (app) unmount();          // guard against double-mount
    app = createApp(Page);
    app.mount(container);
}

function unmount() {
    if (app) {
        app.unmount();
        app = null;
    }
}

document.addEventListener('[your-page]-page-ready', (e) => mount(e.detail.container));
document.addEventListener('[your-page]-page-unload', () => unmount());
```

---

## Step 3 — Root Vue Component

The root component (`Page.vue`) owns the application shell. It:
- Holds top-level state (selected filter, loading flag, open dialog refs)
- Orchestrates child components via props and events
- Defines all modals/sheets at the root to avoid z-index issues

```vue
<!-- components/Page.vue -->
<template>
  <div class="[your-page]-app">
    <Header v-model="selectedItem" :loading="isLoading" @refresh="workspaceRef?.refresh()" />

    <div class="workspace-container">
      <Workspace
        ref="workspaceRef"
        :selected-item="selectedItem"
        @loading="isLoading = $event"
        @edit="openEditDialog"
      />
    </div>

    <EditDialog
      :is-open="editOpen"
      :item="editTarget"
      @close="editOpen = false"
      @saved="onSaved"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Header from './Header.vue'
import Workspace from './Workspace.vue'
import EditDialog from './EditDialog.vue'

const selectedItem = ref(null)
const isLoading = ref(false)
const workspaceRef = ref(null)

const editOpen = ref(false)
const editTarget = ref(null)

function openEditDialog(item) {
  editTarget.value = item
  editOpen.value = true
}

function onSaved() {
  editOpen.value = false
  workspaceRef.value?.refresh()
}
</script>

<style scoped>
.[your-page]-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}
.workspace-container {
  flex: 1;
  overflow: hidden;
  border: 1px solid var(--border-color);
  margin: 8px;
  border-radius: 4px;
}
</style>
```

---

## Step 4 — Workspace Component (Data Fetching)

The Workspace owns data loading and delegates rendering to child components.

```vue
<!-- components/Workspace.vue -->
<template>
  <div v-if="loading" class="state-center">Loading...</div>
  <div v-else-if="error" class="state-center error">{{ error }}</div>
  <EmptyState v-else-if="!items.length" :has-selection="!!selectedItem" />
  <div v-else class="canvas">
    <!-- your visualization here -->
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import EmptyState from './EmptyState.vue'

const props = defineProps({ selectedItem: String })
const emit = defineEmits(['loading', 'edit'])

const items = ref([])
const loading = ref(true)
const error = ref(null)

function load(value) {
  if (!value) { items.value = []; loading.value = false; return }

  loading.value = true
  error.value = null
  emit('loading', true)

  frappe.call({
    method: '[your-app].api.[your-module].get_data',
    args: { item: value },
    callback: (r) => {
      items.value = r.message || []
      loading.value = false
      emit('loading', false)
    },
    error: (err) => {
      error.value = err.message || 'Failed to load'
      loading.value = false
      emit('loading', false)
    }
  })
}

watch(() => props.selectedItem, load, { immediate: true })

defineExpose({ refresh: () => load(props.selectedItem) })
</script>
```

`defineExpose({ refresh })` lets the parent call `workspaceRef.value.refresh()` after a save.

---

## Step 5 — Register in Bundle

```javascript
// [your-app]/public/js/pages.bundle.js
import './pages/[your-page]';
```

---

## Step 6 — Build and Test

```bash
bench build --app [your-app] --hard-link
```

1. Navigate to `/app/[your-page]` — Vue app mounts.
2. Navigate away — `on_page_unload` fires, app unmounts cleanly.
3. Return — fresh mount, no stale state.

---

## Typical Component Tree

```
Page.vue                  (state, dialog orchestration)
├── Header.vue            (filter bar — v-model + @refresh)
├── Workspace.vue         (data fetching + rendering — ref exposed)
│   ├── EmptyState.vue    (no-data placeholder)
│   └── [Canvas/Graph]    (visualization)
└── [Dialog/Sheet].vue    (modals at root for z-index safety)
```
