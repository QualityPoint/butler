# Persistence

The load/save round-trip. This is Print Format's `format_data` mechanism: **parse on load, stringify on save**. The `geometry` JSON field is the only store. See [data-model.md](data-model.md) for the shapes involved.

---

## Load

```
fetch(facility_name):
    frappe.model.with_doc("Facility", facility_name):
        facility.value = doc
        design.value   = doc.geometry
                            ? JSON.parse(doc.geometry)
                            : blank_design()        // { version:1, scale, canvas, floors:[] }
        active_floor.value = design.value.floors[0]?.floor_type ?? null
        dirty.value = false
```

- The canvas is rebuilt **only** from `geometry`.
- `blank_design()` seeds an empty envelope so a never-edited facility opens cleanly.

---

## Save

A single write in one `frappe.client.save`: the whole design serialized into `geometry`.

```
save_changes():
    frappe.dom.freeze(__("Saving..."))

    facility.value.geometry = JSON.stringify(design.value)   // sole source of truth

    frappe.call("frappe.client.save", { doc: facility.value })
        .then(() => fetch())               // re-hydrate from the saved doc
        .always(() => frappe.dom.unfreeze())
```

`geometry` is `hidden=1, read_only=1` on the doctype — it is a machine field, never hand-edited. This is exactly how Print Format treats `format_data`.

---

## Dirty Tracking

`watch` the design deeply; any room add/move/resize/delete marks the store dirty, which the bundle class surfaces as the page's "Not Saved" indicator (see [architecture.md](architecture.md)).

```javascript
watch(design, () => (dirty.value = true), { deep: true });
```

`fetch()` resets `dirty` to `false` after a successful save or a reset.
