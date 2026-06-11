# Python API Layer

Vue islands communicate with Frappe's backend exclusively through whitelisted Python methods called via `frappe.call()`.

---

## Defining a Whitelisted Method

```python
import frappe

@frappe.whitelist()
def get_data(docname):
    """
    Args:
        docname: Name of the source document

    Returns:
        dict: Data for the Vue component
    """
    if not docname:
        return {}

    rows = frappe.get_all(
        "[DocType]",
        filters={"parent": docname},
        fields=["name", "field_a", "field_b"],
        order_by="creation asc"
    )

    return {
        "total": len(rows),
        "items": rows,
        "last_value": rows[-1]["field_a"] if rows else None,
    }
```

**Key rules:**
- `@frappe.whitelist()` is required — without it the method is inaccessible from the client
- Return a plain dict or list; Frappe serializes it to JSON automatically
- Use `frappe.get_all()` so Frappe's permission system applies; avoid raw `frappe.db` unless you have a specific reason to bypass permissions

---

## Calling from Vue

```javascript
frappe.call({
  method: '[your-app].[module-path].get_data',
  args: { docname: frm.doc.name },
  callback: (r) => {
    if (!r.message) return
    items.value = r.message.items
    total.value = r.message.total
  },
  error: (err) => {
    console.error('Failed:', err.message)
  }
})
```

### Response envelope

Frappe wraps every response in an envelope:

```javascript
{
  message:  /* return value from your Python function */,
  docs:     /* any documents loaded */,
  exc:      /* exception traceback text (if error) */,
  exc_type: /* exception class name (if error) */
}
```

Always unwrap via `r.message`. Never access the top-level `r` directly as your data.

---

## API File Placement

| Use case | Recommended location |
|---|---|
| Dashboard data for a single doctype | Alongside the doctype: `doctype/[doctype]/[doctype]_dashboard.py` |
| Page data shared across components | Central API module: `[your-app]/api/[module].py` |
| Complex queries reused in multiple places | `[your-app]/api/[module].py` |

---

## Error Handling

**In Python:** throw explicitly so Frappe serializes the message cleanly:

```python
@frappe.whitelist()
def get_data(docname):
    if not docname:
        frappe.throw("docname is required")

    try:
        # ... fetch data ...
        return result
    except Exception as e:
        frappe.log_error(f"[your-app] get_data failed: {e}")
        frappe.throw(str(e))
```

**In Vue:** always supply an `error` handler:

```javascript
frappe.call({
  method: '...',
  args: { ... },
  callback: (r) => { /* happy path */ },
  error: (err) => {
    error.value = err.message || 'An error occurred'
  }
})
```

---

## Permission Considerations

```python
# ✅ Respects user permissions — recommended default
frappe.get_all("[DocType]", filters={...}, fields=[...])
frappe.get_doc("[DocType]", docname)

# ⚠️ Bypasses permissions — use only when intentional
frappe.db.get_value("[DocType]", docname, "field")
frappe.db.get_all("[DocType]", filters={...})
```

`frappe.get_all()` and `frappe.get_doc()` automatically filter results based on the session user's roles and document-level permissions. Use `frappe.db` only when you have a deliberate reason to bypass those checks (e.g., reading system-level config).
