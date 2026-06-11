# Facility Builder

A visual, drag-and-drop editor for designing a Facility's spatial layout — placing rooms (Space Types) onto floors (Floor Types) like puzzle pieces — built as a Vue desk page, modeled 1:1 on Frappe's **Print Format Builder**.

> New to the underlying Vue technique? Read [`../vue/pattern-lazy-bundle.md`](../vue/pattern-lazy-bundle.md) first — Facility Builder is a direct application of it.

---

## What It Does

- Opens from a button on the **Facility** form, full-width.
- Pick a **Floor Type** (tabs), drag **Space Types** from a palette onto a canvas.
- Rooms are rectangles in v1 (grid-snapped); arbitrary polygons later.
- The whole design is saved as one JSON field (`Facility.geometry`).

---

## Core Architecture Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Surface | Separate `facility-builder` Vue page (Pattern 3), launched from the Facility form with the facility name in the route | Canvas needs full width; mirrors Print Format Builder |
| Canvas engine | **Konva + vue-konva** | Purpose-built for draggable/resizable 2D shapes, polygons, snapping, JSON serialization |
| Source of truth | `Facility.geometry` (Code/JSON, hidden, read-only) — **the only store** | Exactly Print Format's `format_data`: stringify on save, parse on load |
| Blueprint | `facility_blueprint` is ignored | It's an ops PDF/CAD attachment, unrelated to the builder |
| Room color | Resolved from the Space Type's `color` field at render (rooms store none) | Recoloring a Space Type restyles all its rooms without re-saving facilities |

**The golden rule:** `geometry` is the sole source of truth — the entire design (floors + rooms) lives in that one JSON field. There is no derived child table.

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
- **Colors** — Per–Space-Type color (`Color` field on Space Type) drives palette + canvas fills, with a name-hash fallback. ✅ shipped.
- **Blueprints + Layers** — Two layers (`Blueprint | Drawing`, Photoshop-style). Per-floor blueprint (image or PDF via PDF.js; multi-page page-select) as a traceable background with move/scale/rotate/opacity; **measurement calibration** (draw a known length → sets real px/m); upload managed in-builder (child table read-only on form, committed on upload); placement saved in `geometry`. CAD → export to PDF. ✅ shipped.
- **Navigation & editing** — Wheel zoom, middle-drag pan (hand cursor), footer zoom controls (− / % / + / Fit), arrow-key nudge, drawing-layer opacity, Snap switch (default off). ✅ shipped.
- **Later** — Per-floor metadata, copy/duplicate floor, room templates, Space Type `default_area`, native DXF rendering.

### v2 interaction notes

- **Make a polygon:** select a room → Toolbar **Convert to Polygon** → drag vertex handles; **double-click an edge** to add a vertex, **double-click a vertex** to remove it (min 3).
- **Rotate:** drag the Transformer's top handle (snaps to 45°). Polygons rotate + move only (reshape via vertices); rectangles also resize.
- **Scale:** Toolbar `1 m = N px` recomputes every room's area; grid size controls snapping.
