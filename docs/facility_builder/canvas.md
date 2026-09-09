# Canvas (Konva + vue-konva)

The interactive surface. Konva is chosen because it is purpose-built for draggable, resizable 2D shapes with snapping and native JSON serialization. See [data-model.md](data-model.md) for the shape schema this produces.

---

## Stage Structure

```
<v-stage>                         ← Konva stage = the fixed VIEWPORT (fills the container)
  <v-layer name="grid">           ← white "paper" world rect + grid (canvas.grid spacing)
  <v-layer name="blueprint">      ← per-floor blueprint image (trace target); see below
  <v-layer name="rooms">          ← rooms of the ACTIVE floor only
      <RoomShape v-for room ... />
  <v-layer name="ui">             ← Transformer (resize/rotate) for the selected room
  <v-layer name="bp-ui">          ← Transformer for the blueprint (align mode only)
  <v-layer name="features">       ← annex icons per room (Features layer only)
```

One floor is rendered at a time. Switching `FloorTabs` swaps which floor's `rooms` array feeds the rooms layer. Other floors stay in the store, just not drawn.

## Viewport, Zoom & Pan

The stage is a **fixed-size viewport** sized to its container (no page scroll). A `ResizeObserver` keeps `viewport.{w,h}` in sync; `fit_to_viewport()` runs once to centre and scale the world (`canvas.width × canvas.height`) to fit.

The world is navigated with a **view transform** held in reactive state and bound to the stage config — never imperatively, to avoid fighting vue-konva:

- `scale` (`scaleX/scaleY`) — **mouse wheel** zooms around the cursor (`onWheel`: clamp 0.2–6×, recompute `stagePos` so the point under the cursor stays put).
- `stagePos` (`x/y`) — **middle-mouse drag** pans (`startPan`/`onPanMove`, hand cursor); left button stays for objects.
- **Footer controls** (far right): `−` / `+` zoom about the viewport centre (`zoomAt`), a clickable `NN%` readout that **resets to 100%** (`resetZoom`), and **Fit** (`zoomFit` → `fit_to_viewport`) which recentres the whole canvas at full extent (same as on open). The Canvas registers these into the store (`zoom_api`) and mirrors `scale` to `view_scale`, so the Footer can drive them.

Because the whole stage is scaled/panned, **screen↔world conversion** is needed wherever browser coordinates enter: `onDrop` maps the drop point with `(client - box - stagePos) / scale` before snapping.

---

## Pick an amenity, then draw it (no drag-drop)

Creation is **draw-on-canvas**, not drag-drop:

1. `AmenityPalette` is a **selector** — clicking an amenity sets `store.active_amenity` (highlighted; click again to clear). No dragging, no double-click anywhere.
2. With an amenity active, you draw on the canvas using the **active tool**. The cursor reflects the tool (arrow / pen / dot / `crosshair`).

| Tool | Gesture | Store call |
|---|---|---|
| **Select** (default, arrow) | click to select, drag to move — **no drawing** | — |
| Point | single click | `draw_point(x,y)` |
| Rect / Ellipse / Line / Triangle / Pentagon / Hexagon | click-drag to size | `begin_draw` → `update_draw` → `finish_draw` (a no-drag click gets the tool's default size; Line drags a straight 2-point segment) |
| Freehand | click to drop vertices; **double-click** (or **Enter**) to close; **Esc** cancels | `pen_click(x,y)` → `finish_pen` / `cancel_pen` |

All paths funnel through `add_room`, which enforces the bundle per-category limit, caches `room.category`, pushes onto `active_floor.rooms`, selects the new room, and marks dirty. The **active amenity stays selected** so you can draw several in a row.

---

## Selection, copy & snapping

- **Select:** click a shape (`select_only`); **Shift-click** toggles (`toggle_select`); **Ctrl/Cmd+A** selects all (`select_all`); **Esc** or empty-canvas click clears. State lives in `store.selected_ids[]`; `selected_room` is the lone selection (drives the toolbar), `selected_rooms` is all of them.
- **Move a group:** dragging any selected shape moves the whole selection (RoomShape captures start positions on `dragstart` and applies the delta to the rest on `dragmove`/`dragend`).
- **Copy/paste:** **Ctrl/Cmd+C** (`copy_selection` → JSON snapshots in `store.clipboard`) / **Ctrl/Cmd+V** (`paste`, offset +20px, respects bundle caps).
- **Delete / nudge:** Delete/Backspace removes all selected; arrow keys nudge all selected (1px, 10px with Shift).

## Snap-to-shapes (move only)

`store.snap_room_position(id, x, y)` snaps a dragged room's **bounding-box edges** to nearby rooms' edges (within 8px) on `dragend`, so shapes can **touch/align**. It replaces the old grid snap (resizing and drawing are now free). The **Snap toggle** (a Frappe switch wired to `store.toggle_snap`; `design.canvas.snap` persists in geometry) gates it; **default off**.

---

## Resize & Rotation

A Konva `Transformer` (in the `ui` layer) attaches **only when exactly one room is selected** (no transformer for multi-select or while drawing). Its config is reactive to that room's shape (`Canvas.vue`):

- **Rectangle / Ellipse** → all 8 resize anchors + rotate handle (`onTransformEnd` folds the scale back into `w/h` or `rx/ry`).
- **Polygon / Line** → `enabledAnchors: []` (no resize); rotate + move only — they reshape via their vertices.
- **Point** → no anchors, no rotate; move only (style via the toolbar).
- **Rotation** snaps to 45° for everything except points.

### Keyboard (Drawing layer)

The canvas div is focusable (`tabindex`, focused on click) so it receives keys: **Delete/Backspace** (delete selection), **arrows** (nudge selection 1px / 10px+Shift), **Ctrl/Cmd+A** (select all), **Ctrl/Cmd+C/V** (copy/paste), **Enter** (finish freehand), **Esc** (cancel freehand / clear selection / cancel calibration).

### Drawing opacity

A range slider in the Drawing toolbar sets `design.canvas.rooms_opacity` (default 1, persisted in geometry); `RoomShape` applies it to each room **group** so the whole object (fill, outline, label) fades uniformly — handy for seeing the blueprint through the rooms while tracing. Mirrors the blueprint's own opacity control.

---

## Area Calculation

Area is computed in **canvas pixels**, then converted to m² via `scale.pixels_per_meter`, and stored on the room (`room.area`) so it is persisted in `geometry` alongside the shape.

```javascript
const PPM = design.scale.pixels_per_meter;   // pixels per metre

// rectangle
function rectAreaM2(w, h) {
    return (w * h) / (PPM * PPM);
}

// polygon (v2) — shoelace formula over [x0,y0,x1,y1,...]
function polygonAreaM2(points) {
    let a = 0;
    for (let i = 0; i < points.length; i += 2) {
        const x1 = points[i],     y1 = points[i + 1];
        const x2 = points[(i + 2) % points.length], y2 = points[(i + 3) % points.length];
        a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a / 2) / (PPM * PPM);
}
```

Recompute `room.area` on every move/resize/vertex-edit so it is always current at save time. The scale (`pixels_per_meter`) and grid size are edited from the **Toolbar** (`Toolbar.vue`); changing the scale calls `store.set_scale`, which recomputes every room's area across all floors.

---

## Shapes & drawing tools

All shapes share one data model (`shape` discriminator); `RoomShape.vue` branches per shape:

| | `rect` | `ellipse` | `polygon` | `line` | `point` |
|---|---|---|---|---|---|
| Konva node | `Rect` | `Ellipse` | `Line` (`closed`) | `Line` (open) | `Image` (icon) / `Circle` fallback |
| Geometry | `x,y,w,h` | `x,y,rx,ry` | `x,y,points[]` | `x,y,points[]` (≥2, open) | `x,y,icon,color,size` (x,y = centre) |
| Area | `w·h / PPM²` | `π·rx·ry / PPM²` | shoelace / PPM² | **0** (shows length Σseg / PPM) | **0** |
| Editing | move + resize + rotate | move + resize + rotate | move + rotate + vertices | move + rotate + vertices | move only |

### Shape-tool strip + conversion

The Toolbar (drawing layer) shows a row of **icon tool buttons** — Rectangle, Ellipse, Line, Triangle, Pentagon, Hexagon, Freehand, Point (custom inline SVG glyphs, tooltip = name). `store.active_tool` is the highlighted one.

- **Placing:** dropping/double-clicking an amenity calls `store.place_amenity(amenity, x, y)`, which builds the room from `tool_geometry(active_tool)` (triangle/pentagon/hexagon → polygon via `ngon_points`).
- **Converting:** with a room selected, clicking a tool runs `store.convert_room_shape(id, tool)` — it reads the current `shape_extent`, normalises the origin, and rebuilds as the new shape **preserving size + position**.

### Freehand pen

Freehand can't convert instantly (it needs a drawn outline), so it has two entry points, both ending in a canvas drag — `mousedown` → `start_pen`, `mousemove` → `pen_add_point`, `mouseup` → `finish_pen` (RDP-simplifies to ~a dozen vertices; `Esc` cancels):

- **Redraw a selected room** — select a room, click the **Freehand** tool → `set_active_tool("pen")` arms `pen_redraw_id` with that room; the next drag replaces its outline (keeping its amenity/category).
- **New** — with the Freehand tool active, drag/double-click an amenity → `arm_pen(amenity)`; the next drag creates a fresh polygon room.

`pen_new` tracks which path: a too-small stroke discards a brand-new room but reverts an existing one to a rect (so an amenity is never lost). The result is a normal editable polygon. The Toolbar shows a contextual hint while the pen tool is active.

### Points & Frappe icons

A **point** renders its Frappe icon via `load_icon_image(name, color)` (`icons.js`): it reads the in-page `<symbol id="icon-NAME">`, inlines it into a tinted standalone SVG, encodes a `data:` URL, and loads it as a `Konva.Image` (cached by name+color). With no icon it falls back to a category-colored dot. The Toolbar offers an **Icon** picker (`frappe.prompt` with `fieldtype: "Icon"`), a colour swatch, and a size input → `store.set_point_style`.

### Vertex editing (polygons)

When a polygon is selected, two kinds of handle render:

- **Corner handles** (solid `v-circle`) — drag to reshape (`@dragmove` updates `points` live, `@dragend` snaps to grid); **double-click** to delete (kept ≥ 3 points).
- **Midpoint "add" handles** (smaller, semi-transparent, one per edge) — **click** to insert a new vertex at that edge midpoint (`onInsertMidpoint` splices it into `points`); then drag the new corner. This is the discoverable way to add nodes between corners.
- Double-clicking an edge also inserts a vertex (`getRelativePointerPosition` + `dist_to_segment`), as a bonus.

Whole-room drag vs. vertex/handle interaction are disambiguated via `e.cancelBubble = true` on the handles and `e.target !== e.currentTarget` in `onDragEnd`.

---

## Two Layers (Photoshop-style)

The builder has **three layers**, switched from a `[ Blueprint | Drawing | Features ]` selector in the Toolbar (`store.active_layer` = `"blueprint" | "drawing" | "features"`). Only the active layer is interactive (`listening`); the others are visible but locked, so they never fight for clicks.

**Features is select-only.** Rooms listen there so one can be picked, but everything geometric is off: no drag (`RoomShape` gates `draggable` on the drawing layer), no transformer, no vertex handles, no marquee, and delete / nudge / paste are all guarded. Selection is not a modification — it is how you choose which amenity to configure — and it carries between Drawing and Features so a room you just drew is the one you configure.

| Active layer | Interactive | Toolbar controls |
|---|---|---|
| **Blueprint** | the blueprint image (move/scale/rotate) | Upload/Replace, Page ▾, Opacity, Fit, Calibrate Scale |
| **Drawing** | the rooms (drag/resize/rotate, palette drop) | Scale, Grid, shape pill, Delete |

### Blueprint background

Each floor's blueprint comes from the `Facility.blueprints` child table. `blueprint.js` resolves the attachment to a Konva-drawable source:

| File type | Handling |
|---|---|
| Image (PNG/JPG/…) | loaded into an `<img>` |
| **PDF** | the chosen page rendered to an offscreen `<canvas>` via **PDF.js** (`pdfjs-dist`, legacy v3 — see [setup.md](setup.md)) |
| CAD (DWG/DXF) | **not web-renderable** → rejected with an "export to PDF/image" alert |

- `store.active_blueprint_url` finds the `blueprints` row matching the active `floor_type`; `Canvas.vue` watches it, calls `load_blueprint(url, { page })`, and draws a `v-image` in the blueprint layer.
- **Upload** (Blueprint layer) opens Frappe's `FileUploader`; on success `store.set_blueprint_file()` writes the row for the active floor and **saves immediately**. If a document is already attached to the facility, the Upload button first offers to **reuse** it (so a shared multi-page PDF isn't re-uploaded per floor).
- **First load** auto-fits the image (`fit_blueprint`); every move/scale/rotate/opacity change persists to `floor.blueprint` in `geometry` (placement). The **document + page** live in the `blueprints` child-table row (the source).
- **Multi-page PDFs**: `pageCount` (from PDF.js) drives a **Page** dropdown → `store.set_blueprint_page()` writes the row's `page` (reloads that page without re-fitting). Each floor picks its own page of the shared document. (Images are single-page; CAD isn't rendered.)

### Calibrate Scale (measurement)

Sets real-world scale from the blueprint so room areas are accurate:

1. **Calibrate Scale** → `store.calibrating = true`; stage panning is disabled.
2. Click **two points** on a known dimension (captured in world coords via `stage.getRelativePointerPosition()`); a dashed line previews between them (stroke/radius divided by zoom so they stay constant size).
3. A `frappe.prompt` asks the real length in metres → `pixels_per_meter = pixelDistance / metres` → `store.set_scale()` recomputes every room's area.
4. `Esc` or toggling the button off cancels.

## Colors

Room fills come from `resolveColor(room.category, store.category_colors.value)` (`colors.js`):

1. If the room's **Amenity Category** has a `color`, use it.
2. Otherwise fall back to `colorFor(name)` — a deterministic name-hash pastel.

`store.category_colors` is a reactive `{ category → color }` map built from the loaded Amenity Category catalog, so rooms never store a color of their own (see [data-model.md](data-model.md#amenity-category-color-implemented)).
