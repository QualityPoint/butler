# Data Model

The entire layout lives in **one field** — `Butler Quotation.geometry`. Catalog doctypes (Floor Type, Amenity, Amenity Category, Butler Bundle) feed it as inputs. On save, a **derived** flat rollup is written to the quotation's `amenities` child table.

---

## 1. `Butler Quotation.geometry` — Source of Truth

A hidden, read-only `JSON` field on the **Butler Quotation** doctype. Holds the entire layout as one JSON string. This is the exact role `format_data` plays in Print Format. It is **copyable** (not `no_copy`), so a Duplicate/Amend carries the layout over.

> The builder is launched from a Butler Quotation; the facility is read from `quotation.facility` (used only for blueprint files). One facility can have many quotations, each with its own geometry.

### Envelope

```jsonc
{
  "version": 1,                          // bump when the schema changes (enables migration)
  "scale": { "pixels_per_meter": 50 },   // canvas px → real-world metres for area math
  "canvas": { "width": 1200, "height": 800, "grid": 20 },
  "default_light_system_device": "Relay 24CH", // optional: the toolbar's facility-wide pick;
                                         // absent = the default Light System's default device
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
          "amenity": "Rooftop Pool",     // Link → Amenity (record name)
          "category": "Wellness",        // Link → Amenity Category (cached for color + bundle limits)
          "shape": "rect",               // "rect" | "polygon"
          "x": 120, "y": 80,             // top-left (rect) / origin (polygon)
          "w": 200, "h": 150,            // rect only
          "rotation": 0,
          "area": 12.0,                  // m², precomputed (see canvas.md)
          "remarks": "",

          // --- Features layer, all OPTIONAL; absent means "inherit the Amenity" ---
          "annexes": [                   // present only once edited; must keep >= 1 entry
            { "annex": "AC", "qty": 2, "uom": "Nos" }
          ],
          "light_system": "DALI",        // any Light System; seeded with the default
          "light_system_device": "DALI Gateway 128", // only a deliberate pick, off the default
                                         // system; absent = follow the system's default device
          "has_sound_system": 1
        }
      ]
    }
  ]
}
```

### Shape variants (same field, `shape` discriminator)

A room is one of five shapes. `x, y` is the top-left origin for `rect`/`ellipse`/`polygon`/`line`, and the **centre anchor** for `point`.

```jsonc
// polygon — freeform / triangle / pentagon / hexagon / freehand all use this
{ "id":"d4e5f6", "amenity":"Sauna", "category":"Wellness", "shape":"polygon",
  "points":[0,0, 200,0, 200,150, 0,150],  // [x0,y0,...] relative to x,y
  "x":330, "y":80, "rotation":0, "area":3.4, "remarks":"" }

// ellipse — area = π·rx·ry
{ "id":"e7", "amenity":"Fountain", "category":"Outdoor", "shape":"ellipse",
  "rx":60, "ry":50, "x":120, "y":300, "rotation":0, "area":7.5, "remarks":"" }

// line — an OPEN polyline (wall / fence / pipe run); NO area, has a length instead
{ "id":"l9", "amenity":"Boundary Fence", "category":"Outdoor", "shape":"line",
  "points":[0,0, 240,0],  // [x0,y0,...] relative to x,y; ≥2 points, not closed
  "x":80, "y":420, "rotation":0, "area":0, "remarks":"" }

// point — an icon marker; NO area (counts as qty only)
{ "id":"p8", "amenity":"CCTV Camera", "category":"Security", "shape":"point",
  "icon":"camera", "color":"#e24c4c", "size":24, "x":200, "y":140, "rotation":0,
  "area":0, "remarks":"" }
```

- **`rect`** — `w, h`; area `w·h`. **`ellipse`** — `rx, ry`; area `π·rx·ry`. **`polygon`** — `points[]` (closed); shoelace area. **`line`** — `points[]` (open, ≥2); **area 0**, carries a **length** (Σ segment lengths ÷ ppm) shown in metres. **`point`** — `icon` (Frappe icon name, nullable → falls back to a category-colored dot), `color`, `size`; **area 0**.
- The active **shape tool** decides what a dropped amenity becomes; selecting a room + a tool **converts** it (size/position preserved). Triangle/Pentagon/Hexagon are polygon generators; Freehand traces a polygon (RDP-simplified). **Line** is drawn as a straight segment by click-drag, then bent into a polyline via the same vertex/midpoint handles as a polygon (no closing edge).

### Rules

- **Always carry `version`.** It costs nothing and makes future migrations sane (Print Format omitted this and pays for it).
- The field is `hidden=1`, `read_only=1` — a machine field, never hand-edited. It is **not** `no_copy`, so a Duplicate/Amend keeps the layout (intentional — you can amend a quotation and reuse its layout).
- An empty/new quotation has `geometry = null` → the builder starts from a blank `floors: []`.

---

## 1b. `Butler Quotation.amenities` — Derived Rollup (written on save)

On every save the builder writes the `amenities` table as **one row per placement**, each
carrying that placement's **`placement_id`** (the room's own `id`) plus whatever the
Features layer configured. It does **not** price on the client; the **server** does:

- **Composition** — a row whose `annexes_customised` is unset gets its annex rows seeded
  from `Amenity.annexes` (`expand_amenity_rows`). A room only sends annex rows once
  someone has edited them, so an unvisited Features layer can never empty a quotation.
  A placement may drop *some* of its annexes but not all — an amenity is what it is
  composed of, and the master makes that table mandatory.
- **Preservation** — `carry_forward_overrides` copies the quotation's own figures back
  onto the rebuilt rows, matched on `placement_id`: the Quotation Prices (`qtn_*`), their
  standard mirrors, `qtn_exchange_rate`, and the `additional_amenity` tick. Without it a
  builder save would wipe every Quotation Price anyone had changed. The builder never
  sets a Quotation Price itself; they are changed on the quotation only.
- **Pricing** — `calculate_totals()` (in `validate`) resolves each annex against **Annex
  Price**, applies the light/sound/floor add-ons, and fills the three currency tiers and
  the base mirrors.

**One row per placement, always.** `amenity_qty` is pinned to `1`; Butler no longer merges
placements of one amenity on one floor (the old `consolidate_amenities` and its
**Disable Amenity Consolidation** setting are both gone), because per-placement
configuration and consolidation cannot both be true.

The `amenities` table is **regenerated** from geometry each save. Composition is therefore
read-only on the quotation form — the builder owns *what is sold*, the quotation owns
*what it costs*.

**Light system devices.** Device picks live in the drawing: `room.light_system_device` per
room, and `default_light_system_device` on the envelope for the toolbar's facility-wide
*Default Light System Device*. Only a device other than the Light System's default is stored,
so anything not picked follows the default when it changes. The server resolves and counts the
controllers from there; see [light_system_devices.md](../light_system_devices.md).

> **Facility mode** doesn't update an existing quotation — its Save **inserts a new draft Butler Quotation** (with this same rollup) and routes to it. See [persistence.md](persistence.md).

---

## 2. Catalog Doctypes (inputs)

| Doctype | Role in builder |
|---|---|
| **Floor Type** (`floor_name`) | Source of the floor **tabs**. Each tab = one Floor Type record. |
| **Amenity** (`amenity_name`, `amenity_category`, `standard_price`, `image`, flags; `disabled=0` only) | Source of the **palette** pieces dragged onto the canvas. |
| **Amenity Category** (`category_name`, **`color`**, `image`, `bundles` table) | Drives palette **filtering**, room **color**, and (via `bundles`) the per-category **bundle limit**. |
| **Butler Bundle** (`bundle_name`) | Options for the **Bundle** filter when Order Type = Bundle. |
| **Facility Blueprint** (child table `Facility.blueprints`: `floor_type` + `blueprint` Attach + `page` Int) | The per-floor blueprint **source** (document + page). Stays on the **Facility** (shared across quotations). |

### Palette filters (Order Type / Bundle / Amenity Category)

- **Order Type** (`Amenities` / `Bundle` / `Quotation`) and **Bundle** mirror the quotation's own `order_type` / `bundle_type` — read on open, written back on save.
- When **Order Type = Bundle**, the available categories are those whose `Amenity Category.bundles` row matches the selected bundle, and each carries a `amenity_count` **limit** the builder enforces (blocks dropping past the cap; full categories are dimmed with a "Full" badge).
- The sidebar filters, top to bottom: **Butler Manager**, **Facility Type**, **Amenity Categories** (`MultiSelectList`s, as in a Frappe report filter), then a single **Amenity** Link. Each offers **every master record** (every Butler Manager, Facility Type, Amenity Category, enabled Amenity), not only what is linked, drawn or picked elsewhere; Butler Manager and Facility Type show each record's amenity count in the order/bundle scope. The choices narrow the visible amenities together with the order/bundle scope. Butler Manager and Facility Type are **strict**: a chosen value lists only the Amenities that carry it, so an Amenity with that field blank is hidden while it is on. Both are defined once, in `RECORD_FILTERS` (`store.js`): an Amenity field, its doctype and an optional label field. Adding another such filter is one entry there. All of it is ephemeral palette state, not persisted.

### Two caps, deliberately unalike

| | Bundle category cap | Amenity dependency cap |
|---|---|---|
| Rule | placements in a category ≤ the bundle's `amenity_count` | `count(dependant) ≤ count(primary)` — an Intercom per Entrance |
| Fed by | `get_bundle_breakdown` → `bundle_limits` | `amenity.get_dependency_graph()` → `dependency_graph` |
| On breach | **blocks the drop**, dims the entry, "Full" badge | **never blocks**; footer chip + "Needs primary" badge |
| Scope | per category, whole plan | per amenity pair, whole plan (not per floor) |

The difference is the point. A full bundle category is a commercial impossibility — there
is nothing to buy. A dependency shortfall is a drawing you have not finished, and drawing
*more* is one of the two ways to fix it, so refusing the placement would remove one of the
exits. That is also why `amenity_is_short` must never reach `isDisabled` in
`AmenityPalette.vue`.

The dependency cap creates **no link between rooms** — nothing records which dependant
belongs to which primary, only the totals are compared. See
[validations.md](../quotation_pricing/validations.md#dependencies).

### Blueprint: source vs placement

A deliberate split by *what kind of data it is*:

- **Source** → `Facility.blueprints` child table row: `(floor_type, blueprint file, page)`. Self-documenting reference data; `read_only` on the form, managed only from the builder. Can be an **image** or **PDF**; CAD is not web-renderable (see [canvas.md](canvas.md#two-layers-photoshop-style)).
- **Placement** → `floor.blueprint` in `geometry` (`x, y, scaleX, scaleY, rotation, opacity`). Fluid canvas state, like room coords. `null` until aligned. In **facility mode** there is no saved geometry, so the placement is in-memory only (auto-fit on load) until a quotation is spawned — which then bakes the current placement into the new quotation's geometry.

**No multi-page redundancy:** several floors can reference the **same `blueprint` file** with a different `page` — the document is uploaded once and *reused* (the builder's Upload offers existing documents), and each row carries its own page. The file lives once on disk; only the URL string repeats.

### Amenity Category `color` (implemented)

Amenity Category has a **`color`** field (fieldtype `Color`). It drives the fill of every amenity room of that category, in both the palette swatch and the canvas.

- Rooms cache `category` in `geometry` (for color + bundle-limit counting) but store **no color**. The fill is resolved at render time from the category's color, so editing a category's color **recolors all existing rooms** of that category on next load (no re-save needed).
- When a category's `color` is blank, the builder falls back to a deterministic name-hash pastel palette (`colorFor` in `colors.js`). See [canvas.md](canvas.md#colors).

### Still optional (future)

- `default_area` on Amenity — seed size for a freshly dropped piece (rooms currently default to 120×100 px). Roadmap "Later".
