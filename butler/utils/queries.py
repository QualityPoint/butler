import frappe
from frappe.query_builder import Criterion


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_bundle_item(doctype, txt, searchfield, start, page_len, filters):
    """Search query for a Butler Bundle's `bundle_item`, mirroring ERPNext's Product
    Bundle `get_new_item_code`: offers non-stock, non-fixed-asset, non-disabled Items
    that aren't already used as another active Butler Bundle's bundle_item (safe to
    exclude unconditionally since bundle_item is locked after save)."""
    item = frappe.qb.DocType("Item")
    bundle = frappe.qb.DocType("Butler Bundle")

    query = (
        frappe.qb.from_(item)
        .select(item.name, item.item_name)
        .where((item.is_stock_item == 0) & (item.is_fixed_asset == 0) & (item.disabled == 0))
        .where(
            Criterion.any(
                [item[fieldname].like(f"%{txt}%") for fieldname in _search_fields(searchfield)]
            )
        )
        .where(
            item.name.notin(
                frappe.qb.from_(bundle).select(bundle.bundle_item).where(bundle.disabled == 0)
            )
        )
        .limit(page_len)
        .offset(start)
    )
    return query.run()


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_annex_uom_query(doctype, txt, searchfield, start, page_len, filters):
    """Search query for a UOM field scoped to an Annex, e.g. Amenity Annex Item's `uom`
    (scoped to its `annex`). The Annex carries the catalogue attributes; its Item
    (`annex_item`) owns the UOMs, so this resolves through to that Item.

    Unlike ERPNext's own `get_item_uom_query`, this isn't gated behind Stock
    Settings' "Allow UOM with conversion rate defined in Item" toggle (off by
    default) — it always restricts to the Item's configured UOM Conversion Detail
    rows, since that's the only behavior Butler wants here.
    """
    annex = (filters or {}).get("annex")
    item_code = frappe.db.get_value("Annex", annex, "annex_item") if annex else None
    if not item_code:
        return []

    uom_detail = frappe.qb.DocType("UOM Conversion Detail")
    return (
        frappe.qb.from_(uom_detail)
        .select(uom_detail.uom)
        .where(uom_detail.parent == item_code)
        .where(uom_detail.uom.like(f"%{txt}%"))
        .orderby(uom_detail.idx)
        .limit(page_len)
        .offset(start)
        .run()
    )


def _search_fields(searchfield):
    """Item fields to match the typed text against, mirroring ERPNext's Product
    Bundle search query: the caller's searchfield, or the Item's configured search
    fields when it's unset / the default `name`, always including `name`."""
    if not searchfield or searchfield == "name":
        searchfield = frappe.get_meta("Item").get("search_fields")

    fields = searchfield.split(",")
    fields.append("name")
    return [fieldname.strip() for fieldname in fields if fieldname.strip()]
