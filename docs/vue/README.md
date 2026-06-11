# Vue Islands in Frappe Apps

Vue Islands is an architectural pattern for embedding Vue 3 components as isolated, self-contained units within Frappe's desk interface. It gives you modern reactive UI exactly where you need it, while the rest of the app stays on standard Frappe conventions.

---

## When to Use Vue Islands vs Full SPA

| Aspect | Vue Islands | Full SPA (Doppio / standalone) |
|---|---|---|
| Integration | Native within Frappe desk | Separate application |
| Authentication | Frappe session — no extra work | Requires custom auth |
| Permissions | Frappe role system works out of the box | Must replicate permission checks |
| Build complexity | Single `bench build` step | Separate build pipeline |
| Navigation | Frappe's native routing | Custom routing required |
| Use case | Internal desk tools, dashboards, form enhancements | Customer-facing portals, mobile apps |

**Use Vue Islands** for internal tools, Doctype dashboards, and rich interactive UIs (graphs, trees, charts) that live inside the Frappe desk.

**Use a Full SPA** for customer-facing portals, mobile apps, or entirely custom design systems.

---

## Ownership Boundary

| Frappe Owns | Vue Owns |
|---|---|
| Page routing and navigation | Component reactivity and state |
| Authentication and sessions | UI interactions within the island |
| Form save/submit logic | Data visualization and rendering |
| Sidebar, navbar, breadcrumbs | Island's internal DOM |
| Global CSS (Bootstrap) | Scoped component styles |
| DocType schemas and validation | Presentation logic |

---

## Documentation Index

| File | Contents |
|---|---|
| [concepts.md](concepts.md) | Architecture overview, two integration patterns |
| [setup.md](setup.md) | Package installation, bundle entry points, hooks registration |
| [pattern-dashboard.md](pattern-dashboard.md) | Pattern 1 — Doctype Dashboard Island |
| [pattern-page.md](pattern-page.md) | Pattern 2 — Full Custom Page Island |
| [pattern-lazy-bundle.md](pattern-lazy-bundle.md) | Pattern 3 — Lazy Bundle + Shared Store (**Frappe core's own technique**) |
| [css-and-libraries.md](css-and-libraries.md) | CSS isolation, Tailwind, Radix Vue headless components |
| [pitfalls.md](pitfalls.md) | Common problems and solutions |
| [comparison.md](comparison.md) | **Islands vs core compared; sweet spots; recommended hybrid for Butler** |
