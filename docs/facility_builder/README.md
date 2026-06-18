# Facility Builder

A visual, drag-and-drop editor for laying out a **Butler Quotation**'s amenities over its Facility's floor plan — placing amenities (filtered by Order Type / Bundle / Amenity Category) onto floors (Floor Types) like puzzle pieces — built as a Vue desk page, modeled 1:1 on Frappe's **Print Format Builder**.

> New to the underlying Vue technique? Read [`../vue/pattern-lazy-bundle.md`](../vue/pattern-lazy-bundle.md) first — Facility Builder is a direct application of it.

> **History:** the builder originally placed generic **Space Types** onto a **Facility** (`Facility.geometry`). It was repurposed (2026-06) to place **Amenities** for a **Butler Quotation**; Space Type is being retired. Pre-rework details live in git history.

---

## What It Does

The builder runs in one of **two modes**, carried in the route as `facility-builder/<mode>/<name>`:

- **Facility mode** (`…/facility/<facility>`) — opened from the **Facility** form. An ephemeral layout session: floor tabs are seeded from the facility's blueprint rows (blueprints reload + auto-fit); **nothing persists on the Facility but blueprint files**. On **Save** with ≥1 placed amenity it **creates a brand-new draft Butler Quotation** (facility, order config, geometry, amenity rollup) and switches the route to it. Always creates a new quotation.
- **Quotation mode** (`…/quotation/<quotation>`) — opened from the **Butler Quotation** form. Edits that quotation's layout; **draft-only** (Submitted/Cancelled open read-only). The facility is read from `quotation.facility` (blueprint files only).

In both modes you:
- Filter the amenity palette by **Order Type** (Amenities / Bundle / Quotation), **Bundle** (when Order Type = Bundle), and one-or-more **Amenity Categories** (MultiSelectList).
- Pick a **Floor Type** (tabs), **select an amenity** from the palette (the active amenity shows in the toolbar), then **draw it on the canvas** with the active tool — **Select** (default; click/drag to select & move), Freehand, Point, Rectangle, Ellipse, Triangle/Pentagon/Hexagon. (No drag-drop or double-click.)
- Rooms are rect/ellipse/polygon/point, each one placed amenity on that floor. Multi-select (click / Shift-click / Ctrl+A), copy-paste (Ctrl+C/V), group-move, and snap-to-shapes (so they touch) are supported.
- The layout is saved as one JSON field (`Butler Quotation.geometry`); on save, placements consolidate into the quotation's `amenities` table as distinct **(amenity + floor_type)** rows with `qty` = placement count.

---

## Core Architecture Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Surface | Separate `facility-builder` Vue page (Pattern 3), launched from the **Facility** or **Butler Quotation** form; route encodes `<mode>/<name>` | Canvas needs full width; mirrors Print Format Builder |
| Quotation creation | Facility mode **inserts a new draft Butler Quotation** on Save when ≥1 amenity is placed, then routes to it (always new) | Lets a layout session originate a quotation; 0 amenities = nothing to create |
| Source of truth | `Butler Quotation.geometry` (Code/JSON, hidden, read-only, no-copy) — **the only store for placement**. The **Facility no longer has a geometry field** | Exactly Print Format's `format_data`: stringify on save, parse on load |
| Amenity rows | On save, placements consolidate into distinct **(amenity + floor_type)** `Butler Quotation Item` rows (`qty` = count, `rate`/`amount` from Amenity price, flags mirrored) | The quotation needs a flat, priced, per-floor amenity list; geometry stays the placement store |
| Blueprint source | Blueprint **files** stay on `Facility.blueprints` (shared across quotations); only the **placement** lives in geometry | A facility's physical plan is reused by every quotation of it |
| Room color | Resolved from the **Amenity Category**'s `color` at render (rooms cache `category`, store no color) | Recoloring a category restyles all its amenity rooms without re-saving |
| Doc state | Facility mode is always editable; quotation mode opens any docstatus for viewing but **Save is blocked** for Submitted (1) / Cancelled (2) | Submitted/cancelled quotations are an audit trail |

**The golden rule:** `geometry` is the sole source of truth for the **layout** — floors + placed amenities live in that one JSON field on the Butler Quotation. The `amenities` child table is a **derived** flat rollup produced on save.

---

## Documentation Index

| File | Concern |
|---|---|
| [data-model.md](data-model.md) | The `geometry` JSON envelope (the single store) |
| [architecture.md](architecture.md) | Page surface, launch from form, component tree, store, Frappe↔Vue bridge |
| [canvas.md](canvas.md) | Konva canvas: floors, palette, drag-drop, snapping, area math, shapes |
| [persistence.md](persistence.md) | Load/save round-trip (geometry only) |
| [setup.md](setup.md) | Packages, bundle entry, page doctype, build commands |

---

## Roadmap

- **v1** — Rectangles, grid snapping, multi-floor, geometry JSON persistence. ✅ shipped.
- **v2** — Free-form polygons (`shape: "polygon"`, vertex add/drag/delete), rotation handles (snap 45°), real-world scale UI (px↔metres) + grid size, via the canvas Toolbar. ✅ shipped.
- **Colors** — Per–Amenity-Category color (`Color` field on Amenity Category) drives palette + canvas fills, with a name-hash fallback. ✅ shipped.
- **Blueprints + Layers** — Two layers (`Blueprint | Drawing`, Photoshop-style). Per-floor blueprint (image or PDF via PDF.js; multi-page page-select) as a traceable background with move/scale/rotate/opacity; **measurement calibration** (draw a known length → sets real px/m); upload managed in-builder (child table read-only on form, committed on upload); placement saved in `geometry`. CAD → export to PDF. ✅ shipped.
- **Navigation & editing** — Wheel zoom, middle-drag pan (hand cursor), footer zoom controls (− / % / + / Fit), arrow-key nudge, drawing-layer opacity, Snap switch (default off). ✅ shipped.
- **Shapes & tools** — A shape-tool strip (icon glyphs): Rectangle, Ellipse, Triangle/Pentagon/Hexagon (polygon generators), Freehand pen (RDP-simplified trace), and **Point** markers rendered as **Frappe icons** (icon/color/size). Ellipse area = π·rx·ry; points have 0 area but still count as qty. ✅ shipped.
- **Later** — Per-floor metadata, copy/duplicate floor, room templates, Amenity `default_area`, native DXF rendering, default icon per Amenity.

### v2 interaction notes

- **Make a polygon:** select a room → Toolbar **Convert to Polygon** → drag vertex handles; **double-click an edge** to add a vertex, **double-click a vertex** to remove it (min 3).
- **Rotate:** drag the Transformer's top handle (snaps to 45°). Polygons rotate + move only (reshape via vertices); rectangles also resize.
- **Scale:** Toolbar `1 m = N px` recomputes every room's area; grid size controls snapping.
