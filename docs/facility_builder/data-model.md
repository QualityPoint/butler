# Data Model

The entire design lives in **one field** — `Facility.geometry`. Two catalog doctypes (Floor Type, Space Type) feed it as inputs. There is no derived child table.

---

## 1. `Facility.geometry` — Source of Truth

A hidden, read-only `Code` field (Options: `JSON`) on the **Facility** doctype. Holds the entire layout as one JSON string. This is the exact role `format_data` plays in Print Format.

### Envelope

```jsonc
{
  "version": 1,                          // bump when the schema changes (enables migration)
  "scale": { "pixels_per_meter": 50 },   // canvas px → real-world metres for area math
  "canvas": { "width": 1200, "height": 800, "grid": 20 },
  "floors": [
    {
      "floor_type": "Ground Floor",      // Link → Floor Type (record name)
      "blueprint": {                     // optional: PLACEMENT of this floor's blueprint
        "x": 60, "y": 40,                //   (the FILE + PAGE live in Facility.blueprints row)
        "scaleX": 0.5, "scaleY": 0.5,
        "rotation": 0, "opacity": 0.6
      },
      "rooms": [
        {
          "id": "a1b2c3",                // stable client-side uuid
          "space_type": "Bedroom",       // Link → Space Type (record name)
          "shape": "rect",               // "rect" (v1) | "polygon" (v2)
          "x": 120, "y": 80,             // top-left (rect) / origin (polygon)
          "w": 200, "h": 150,            // rect only
          "rotation": 0,
          "area": 12.0,                  // m², precomputed (see canvas.md)
          "remarks": ""
        }
      ]
    }
  ]
}
```

### Polygon variant (v2, same field)

```jsonc
{
  "id": "d4e5f6",
  "space_type": "Bathroom",
  "shape": "polygon",
  "points": [0,0, 200,0, 200,150, 100,150, 100,80, 0,80],  // [x0,y0,x1,y1,...] relative to x,y
  "x": 330, "y": 80,
  "rotation": 0,
  "area": 3.4,
  "remarks": ""
}
```

### Rules

- **Always carry `version`.** It costs nothing and makes future migrations sane (Print Format omitted this and pays for it).
- The field is `hidden=1`, `read_only=1` — it is a machine field, never hand-edited.
- An empty/new facility has `geometry = null` → the builder starts from a blank `floors: []`.

---

## 2. Catalog Doctypes (inputs)

| Doctype | Role in builder |
|---|---|
| **Floor Type** (`floor_name`) | Source of the floor **tabs**. Each tab = one Floor Type record. |
| **Space Type** (`space_name`, **`color`**, `description`) | Source of the **palette** pieces dragged onto the canvas. |
| **Facility Blueprint** (child table `Facility.blueprints`: `floor_type` + `blueprint` Attach + `page` Int) | The per-floor blueprint **source** (document + page). The builder matches a row to the active floor by `floor_type`. |

### Blueprint: source vs placement

A deliberate split by *what kind of data it is*:

- **Source** → `Facility.blueprints` child table row: `(floor_type, blueprint file, page)`. Self-documenting reference data; `read_only` on the form, managed only from the builder. Can be an **image** or **PDF**; CAD is not web-renderable (see [canvas.md](canvas.md#two-layers-photoshop-style)).
- **Placement** → `floor.blueprint` in `geometry` (`x, y, scaleX, scaleY, rotation, opacity`). Fluid canvas state, like room coords. `null` until aligned.

**No multi-page redundancy:** several floors can reference the **same `blueprint` file** with a different `page` — the document is uploaded once and *reused* (the builder's Upload offers existing documents), and each row carries its own page. The file lives once on disk; only the URL string repeats.

### Space Type `color` (implemented)

Space Type has a **`color`** field (fieldtype `Color`). It drives the fill of every room of that type, in both the palette swatch and the canvas.

- Rooms store **only** `space_type` in `geometry` — **not** a color. The fill is resolved at render time from the Space Type's color, so editing a Space Type's color **recolors all existing rooms** of that type on next load (no facility re-save needed).
- When a Space Type's `color` is blank, the builder falls back to a deterministic name-hash pastel palette (`colorFor` in `colors.js`). See [canvas.md](canvas.md#colors).

### Still optional (future)

- `default_area` (Float) on Space Type — seed size for a freshly dropped piece (rooms currently default to 120×100 px). Roadmap "Later".
