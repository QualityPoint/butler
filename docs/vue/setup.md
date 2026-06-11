# Setup — Packages, Bundles, and Build

## Directory Structure

```
[your-app]/
├── node_modules/              ← Vue Islands packages (desk bundles)
├── package.json               ← Vue Islands dependencies
├── public/
│   └── js/
│       ├── app.bundle.js      ← Global utilities (loaded on every desk page)
│       ├── dashboard.bundle.js← Entry point for all dashboard islands
│       ├── pages.bundle.js    ← Entry point for all page islands
│       └── pages/
│           └── [your-page].js ← Per-page Vue lifecycle manager
└── [your-app]/
    ├── doctype/
    │   └── [your-doctype]/
    │       ├── [your-doctype].js              ← Frappe form controller
    │       ├── [your-doctype]_dashboard.js    ← Dashboard factory
    │       ├── [your-doctype]_dashboard.vue   ← Dashboard Vue component
    │       └── [your-doctype]_dashboard.py    ← Dashboard Python API
    └── page/
        └── [your-page]/
            ├── [your-page].js                 ← Frappe page controller
            └── components/
                ├── Page.vue                   ← Root Vue component
                └── *.vue                      ← Child components
```

---

## Package Installation

### Install at App Root — Not in `frontend/`

Vue Islands packages **must** be installed at the app root. Frappe's esbuild looks for `node_modules/` at the app root. The `frontend/` directory is for a standalone SPA and is completely separate.

```bash
cd frappe-bench/apps/[your-app]
yarn add vue                         # if not already provided by frappe-ui
yarn add [your-library]              # any third-party Vue library your islands need
yarn add radix-vue                   # example: headless UI components
yarn add -D @tailwindcss/cli tailwindcss postcss   # if using Tailwind
```

> **Note:** `vue` itself is already bundled by Frappe's `frappe-ui` package. Import from `'vue'` works without reinstalling it.

### package.json (app root)

```json
{
  "name": "[your-app]",
  "scripts": {
    "tw:build": "node_modules/.bin/tailwindcss -i ./[your-app]/public/css/tailwind.css -o ./[your-app]/public/css/tailwind.output.css --minify",
    "tw:watch": "node_modules/.bin/tailwindcss -i ./[your-app]/public/css/tailwind.css -o ./[your-app]/public/css/tailwind.output.css --watch"
  },
  "dependencies": {
    "radix-vue": "^1.9.17"
  },
  "devDependencies": {
    "@tailwindcss/cli": "^4.2.2",
    "tailwindcss": "^4.2.2",
    "postcss": "^8.5.8"
  }
}
```

---

## Bundle Entry Points

Frappe's build system (`bench build`) automatically discovers any file matching `**/*.bundle.js`, treats it as an esbuild entry point, and outputs compiled bundles to `public/dist/js/`.

### dashboard.bundle.js

Central aggregator for all dashboard island factories. Import each dashboard factory here.

```javascript
// [your-app]/public/js/dashboard.bundle.js

import '../../[your-app]/doctype/[your-doctype]/[your-doctype]_dashboard.js';
// import '../../[your-app]/doctype/[another-doctype]/[another-doctype]_dashboard.js';
```

### pages.bundle.js

Central aggregator for all full-page Vue apps. Import each page lifecycle manager here.

```javascript
// [your-app]/public/js/pages.bundle.js

import './pages/[your-page]';
// import './pages/[another-page]';
```

### app.bundle.js (optional)

Global utilities loaded on every desk page. Keep this lean.

```javascript
// [your-app]/public/js/app.bundle.js

import './utilities/utils.js';
import './utilities/filters.js';
```

---

## Registering Bundles in hooks.py

```python
# [your-app]/hooks.py

app_include_css = [
    "/assets/[your-app]/css/[your-app].css",
]

app_include_js = [
    "app.bundle.js",
    "dashboard.bundle.js",
    "pages.bundle.js",
]
```

All bundles load on every desk page (selective loading per page is not supported at this level). Keep each bundle lean — include only what it needs.

---

## Build Commands

| Command | When to use |
|---|---|
| `bench build --app [your-app]` | After changing any `.vue` file, bundle entry, or import |
| `bench build --app [your-app] --hard-link` | Local development — changes reflect without full rebuild |
| `yarn tw:build` | After changing Tailwind source; before deploy |
| `yarn tw:watch` | Active Tailwind development |
| `bench clear-cache && bench restart` | After build, if changes don't appear |

### Full rebuild sequence

```bash
# 1. Install/update dependencies
cd frappe-bench/apps/[your-app]
yarn install

# 2. Build Tailwind (if using)
yarn tw:build

# 3. Build Frappe desk bundles
cd frappe-bench
bench build --app [your-app]

# 4. Clear cache and restart
bench clear-cache
bench restart
```

### Troubleshooting

```bash
# Module not found errors
cd frappe-bench/apps/[your-app] && yarn install

# Build hangs or fails
pkill -9 node && pkill -9 esbuild
rm -rf [your-app]/public/dist/*
bench build --app [your-app]

# Changes not reflecting
bench clear-cache && bench restart
# or hard reload: Ctrl+Shift+R
```
