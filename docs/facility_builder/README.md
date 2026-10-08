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
- Filter the amenity palette by **Order Type** (Amenities / Bundle / Quotation), **Bundle** (when Order Type = Bundle), one-or-more **Butler Managers**, **Facility Types** and **Amenity Categories** (MultiSelectList), and a single **Amenity**. Each filter offers every master record of its doctype.
- Pick a **Floor Type** (tabs), **select an amenity** from the palette (the active amenity shows in the toolbar), then **draw it on the canvas** with the active tool — **Select** (default; click/drag to select & move), Freehand, Point, Rectangle, Ellipse, Line, Triangle/Pentagon/Hexagon. (No drag-drop or double-click.)
- Rooms are rect/ellipse/polygon/line/point, each one placed amenity on that floor. Multi-select (click / Shift-click / Ctrl+A), copy-paste (Ctrl+C/V), group-move, and snap-to-shapes (so they touch) are supported.
- The layout is saved as one JSON field (`Butler Quotation.geometry`); on save the builder writes the quotation's `amenities` table as **one row per placement**, each tagged with that placement's `placement_id`, and the **server** seeds any missing annex rows and prices everything.

---

## Core Architecture Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Surface | Separate `facility-builder` Vue page (Pattern 3), launched from the **Facility** or **Butler Quotation** form; route encodes `<mode>/<name>` | Canvas needs full width; mirrors Print Format Builder |
| Quotation creation | Facility mode **inserts a new draft Butler Quotation** on Save when ≥1 amenity is placed, then routes to it (always new) | Lets a layout session originate a quotation; 0 amenities = nothing to create |
| Source of truth | `Butler Quotation.geometry` (JSON field, hidden, read-only; **copyable** — carried into a Duplicate/Amend) — **the only store for placement**. The **Facility no longer has a geometry field** | Exactly Print Format's `format_data`: stringify on save, parse on load |
| Amenity rows | On save the builder sends **one row per placement** — `{placement_id, amenity, floor_type}` plus whatever the Features layer configured — and the **server** seeds missing annexes, carries the quotation's own prices back on, and prices everything in `validate` | Each drawn amenity is separately configurable and separately priced; pricing stays server-authoritative; geometry remains the placement store |
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
- **Blueprints + Layers** — Three layers (`Blueprint | Drawing | Features`, Photoshop-style). Per-floor blueprint (image or PDF via PDF.js; multi-page page-select) as a traceable background with move/scale/rotate/opacity; **measurement calibration** (draw a known length → sets real px/m); upload managed in-builder (child table read-only on form, committed on upload); placement saved in `geometry`. CAD → export to PDF. ✅ shipped.
- **Features layer** — Configure what each *drawn* amenity contains: its annexes (add / remove / quantity / uom), its light system and its sound system, edited in the sidebar panel with the annexes drawn as icons on the plan. Rooms are select-only there — no move, resize or reshape. A customised placement is outlined in amber — a light system equal to the default does not count as one, since every placement carries one, and **Apply to all like this** copies one placement's configuration onto every other placement of that amenity. ✅ shipped.
- **Navigation & editing** — Wheel zoom, middle-drag pan (hand cursor), footer zoom controls (− / % / + / Fit), arrow-key nudge, drawing-layer opacity, Snap switch (default off). ✅ shipped.
- **Shapes & tools** — A shape-tool strip (icon glyphs): Rectangle, Ellipse, **Line** (open polyline — drag a segment, then bend it via vertex handles; shows length in m, 0 area), Triangle/Pentagon/Hexagon (polygon generators), Freehand pen (RDP-simplified trace), and **Point** markers rendered as **Frappe icons** (icon/color/size). Ellipse area = π·rx·ry; lines/points have 0 area but still count as qty. ✅ shipped.
- **Later** — Per-floor metadata, copy/duplicate floor, room templates, Amenity `default_area`, native DXF rendering, default icon per Amenity.

### v2 interaction notes

- **Make a polygon:** select a room → Toolbar **Convert to Polygon** → drag vertex handles; **double-click an edge** to add a vertex, **double-click a vertex** to remove it (min 3).
- **Rotate:** drag the Transformer's top handle (snaps to 45°). Polygons rotate + move only (reshape via vertices); rectangles also resize.
- **Scale:** Toolbar `1 m = N px` recomputes every room's area; grid size controls snapping.

### The Features panel's layout, and why

Three zones down the 240px sidebar: the selected amenity's **head**, the **annexes** taking
whatever height is left, and the **light system** with the **sound system** under it pinned
to the bottom. Both are offered on **every** amenity: one with no sound price of its own is
charged Butler Settings' default. Only the annex list scrolls, so the two single choices stay visible however
long the composition gets.

That constrains where a dropdown may live. `overflow-y: auto` makes an element a clipping
box on *both* axes — CSS forces the other axis to `auto` alongside it — and no `z-index`
escapes an overflow clip. So nothing that opens a floating list goes inside the annex
scroller:

| Picker | Where | How |
|---|---|---|
| Add annex | above the scroller | Link (`Annex`, filtered to the Amenity's own, minus what is fitted) |
| Annex UOM | **inside** the scroller | a plain `<select>` — the browser draws its popup outside the document, so a scroller cannot clip it |
| Light System | below the scroller | Link (`Light System`, the whole master — an amenity that configures none still gets one), seeded with the default and never blank, its list flipped to open **upward** since it sits on the sidebar's bottom edge |
| Light System Device | under the Light System, only when it is **not** the default system | Link (`Light System Device`, filtered to the room's system's own devices), seeded with that system's default device. See [light_system_devices.md](../light_system_devices.md) |
| Default Light System Device | the **toolbar**, Features layer | Link (`Light System Device`, filtered to the default system's devices): one for the whole facility |

The `<select>`'s options travel with the composition: `get_amenity_annexes` returns a `uoms`
list per annex — the same UOM Conversion Detail rows `get_annex_uom_query` would have
offered — resolved for the whole floor in one query rather than one lookup per opened
dropdown. A uom the master no longer offers is still listed while a room holds it, so
nothing has its unit silently changed by being looked at.
