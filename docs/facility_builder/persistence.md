# Persistence

The load/save round-trip. This is Print Format's `format_data` mechanism: **parse on load, stringify on save**. The `geometry` JSON field on the **Butler Quotation** is the layout store; the `amenities` child table is a derived rollup written on save. See [data-model.md](data-model.md) for the shapes involved.

---

The store is created as `getStore(mode, name)` with `mode ∈ {"facility", "quotation"}`, and `fetch`/`save_changes` branch on it.

## Load

**Quotation mode** — rebuild from the quotation's geometry:

```
fetch_quotation():
    frappe.model.with_doc("Butler Quotation", name):
        quotation.value = doc
        design.value    = doc.geometry ? JSON.parse(doc.geometry) : blank_design()
        order_type.value  = doc.order_type || "Amenities"
        bundle_type.value = doc.bundle_type || null
        load Facility(doc.facility)        // blueprint files only
        load Amenity + Amenity Category catalogs; bundle limits (if Bundle)
        dirty.value = false
```

**Facility mode** — a fresh ephemeral session over a Facility:

```
fetch_facility():
    frappe.model.with_doc("Facility", name):
        facility.value  = doc
        quotation.value = null
        design.value    = blank_design()
        // seed floor tabs from the facility's blueprint rows so blueprints reload (auto-fit)
        for row in doc.blueprints: add floor(row.floor_type)
        order_type.value = "Amenities"; bundle_type.value = null
        load catalogs; dirty.value = false
```

- The canvas is rebuilt **only** from `geometry` (blank in facility mode; blueprint placement auto-fits).
- `read_only` is `false` in facility mode; in quotation mode it's `quotation.docstatus ≠ 0` (Submitted/Cancelled → view-only).

---

## Save

**Quotation mode** — one `frappe.client.save` carries the layout **and** the derived rows:

```
save_quotation():
    if read_only: msgprint("…cannot be edited"); return        // Submitted/Cancelled guard
    if order_type == "Bundle" and not bundle_type: warn; return

    quotation.value.geometry    = JSON.stringify(design.value)  // layout store
    quotation.value.order_type  = order_type.value              // write filters back
    quotation.value.bundle_type = order_type === "Bundle" ? bundle_type.value : null
    quotation.value.amenities   = build_amenity_rows()          // distinct (amenity+floor_type), qty = count

    frappe.client.save({ doc: quotation.value }).then(() => fetch())
```

**Facility mode** — Save **spawns a new draft quotation** (when ≥1 amenity) and routes to it:

```
create_quotation():
    if placed_count < 1: warn("Place at least one amenity…"); return
    if order_type == "Bundle" and not bundle_type: warn; return

    frappe.client.insert({ doc: {
        doctype: "Butler Quotation", naming_series: "BTLR-QTN-.YYYY.-",
        facility: facility.value.name, order_type, bundle_type (if Bundle),
        geometry: JSON.stringify(design.value), amenities: build_amenity_rows(),
    }}).then(r => frappe.set_route("facility-builder", "quotation", r.message.name))
```

`geometry` is `hidden=1, read_only=1, no_copy=1` on the quotation — a machine field, never hand-edited. (The **Facility no longer has a geometry field**.)

### Blueprint files save the Facility, not the Quotation

Blueprint **files** live on `Facility.blueprints` (shared across quotations), so uploading/replacing a blueprint or changing its page calls a separate **`save_facility()`** (`frappe.client.save` of the Facility doc). The blueprint **placement** still lives in the quotation's `geometry` and saves with the layout.

---

## Dirty Tracking

`watch` the design deeply; any room add/move/resize/delete marks the store dirty, which the bundle class surfaces as the page's "Not Saved" indicator (see [architecture.md](architecture.md)).

```javascript
watch(design, () => (dirty.value = true), { deep: true });
```

`fetch()` resets `dirty` to `false` after a successful save or a reset.
