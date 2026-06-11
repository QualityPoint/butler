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

## Palette → Canvas (drag-drop)

1. `SpacePalette` lists Space Type records as draggable chips.
2. On drop onto the stage, read the pointer position and create a room:

```javascript
function onDrop(space_type, pointer) {
    store.add_room({
        id: frappe.utils.get_random(8),
        space_type,
        shape: "rect",
        x: snap(pointer.x), y: snap(pointer.y),
        w: 120, h: 100,            // or Space Type.default_area if added
        rotation: 0,
        area: 0, remarks: "",
    });
}
```

`add_room` pushes onto `active_floor.rooms` and marks the store dirty.

---

## Grid Snapping (the "puzzle" feel)

All snapping goes through **one** store helper, `store.snap_coord(v)`, used by every drag/resize/vertex/drop:

```javascript
function snap_coord(v) {
    if (design.canvas.snap !== true) return v;           // off → free placement
    const g = design.canvas.grid || 1;
    return Math.round(v / g) * g;
}
```

- **Snap toggle** — a Frappe switch (`label.switch > .slider.round`, same as the timeline's "Show all activity") wired to `store.toggle_snap`; `design.canvas.snap` persists in geometry. **On** = clean grid drawing; **off** = free movement/resize so you can **trace exactly onto a blueprint**. **Default off** (tracing-first).
- On `transformend` (resize), the node's scale is folded into `w`/`h`, scale reset to 1, then `snap_coord`. With snap off, the minimum room size drops from one grid cell to 1px so you can size freely.

---

## Selection, Resize & Rotation

- Click a `RoomShape` → set `store.selected_id = room.id`.
- A Konva `Transformer` (in the `ui` layer) attaches to the selected node. Its config is **reactive to the selected room's shape** (`Canvas.vue`):
  - **Rectangle** → all 8 resize anchors + rotate handle.
  - **Polygon** → `enabledAnchors: []` (no resize); rotate + move only — polygons reshape via their vertices.
- **Rotation** is enabled with 45° snapping (`rotationSnaps`). `onTransformEnd` persists `rotation` (and, for rects, the new `w/h` folded out of the transform scale).

### Keyboard (Drawing layer, room selected)

The canvas div is focusable (`tabindex`, focused on click) so it receives keys:

- **`Delete` / `Backspace`** → `store.delete_room(selected_id)`.
- **Arrow keys** → nudge the selected room (`onNudge`). Step = one grid cell when Snap is on, else **1px** (or **10px with Shift**). Works for rects and polygons (shifts the origin).
- **`Esc`** → cancel calibration.

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

## Rectangles & Polygons (both implemented)

Both share one data model (`shape` discriminator). `RoomShape.vue` branches with `v-if="room.shape !== 'polygon'"` (a `v-rect`) vs `v-else` (a closed `v-line`):

| | `rect` | `polygon` |
|---|---|---|
| Konva node | `Rect` | `Line` (`closed: true`) |
| Geometry | `x, y, w, h` | `x, y, points[]` (relative to `x,y`) |
| Area | `w*h / PPM²` | shoelace / PPM² |
| Editing | move + resize + rotate | move + rotate + drag/add/delete vertices |

### Shape toggle (Rectangle ⇄ Polygon)

The Toolbar shows a **Rectangle | Polygon** pill for the selected room:

- **→ Polygon:** `store.convert_to_polygon(id)` replaces `w/h` with the 4 corner points (`rect_to_polygon_points`).
- **→ Rectangle:** `store.convert_to_rectangle(id)` collapses the polygon back to its **bounding rectangle** (`room_bbox` — the longest horizontal/vertical extent), shifts the origin to the bbox corner, restores `w/h`, and drops `points`.

### Vertex editing (polygons)

When a polygon is selected, two kinds of handle render:

- **Corner handles** (solid `v-circle`) — drag to reshape (`@dragmove` updates `points` live, `@dragend` snaps to grid); **double-click** to delete (kept ≥ 3 points).
- **Midpoint "add" handles** (smaller, semi-transparent, one per edge) — **click** to insert a new vertex at that edge midpoint (`onInsertMidpoint` splices it into `points`); then drag the new corner. This is the discoverable way to add nodes between corners.
- Double-clicking an edge also inserts a vertex (`getRelativePointerPosition` + `dist_to_segment`), as a bonus.

Whole-room drag vs. vertex/handle interaction are disambiguated via `e.cancelBubble = true` on the handles and `e.target !== e.currentTarget` in `onDragEnd`.

---

## Two Layers (Photoshop-style)

The builder has **two layers**, switched from a `[ Blueprint | Drawing ]` selector in the Toolbar (`store.active_layer` = `"blueprint" | "drawing"`). Only the active layer is interactive (`listening`); the other is visible but locked, so the two never fight for clicks.

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

Room fills come from `resolveColor(space_type, store.space_colors.value)` (`colors.js`):

1. If the room's **Space Type** has a `color`, use it.
2. Otherwise fall back to `colorFor(name)` — a deterministic name-hash pastel.

`store.space_colors` is a reactive `{ space_type → color }` map built from the loaded Space Type catalog, so rooms never store a color of their own (see [data-model.md](data-model.md#space-type-color-implemented)).
