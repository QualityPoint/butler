import frappe
from frappe.query_builder import Criterion

from butler.utils.validations import REPRESENTATIVE_ITEM_DOCTYPES


@frappe.whitelist()
def get_item_name(item):
    return frappe.db.get_value("Item", item, "item_name")


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_bundle_item(doctype, txt, searchfield, start, page_len, filters):
    """Search query for a Butler Bundle's `bundle_item`, mirroring ERPNext's Product
    Bundle `get_new_item_code`. See _representative_item_query for the shared logic."""
    return _representative_item_query("Butler Bundle", txt, searchfield, start, page_len)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_amenity_item(doctype, txt, searchfield, start, page_len, filters):
    """Search query for an Amenity's `amenity_item`."""
    return _representative_item_query("Amenity", txt, searchfield, start, page_len)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_annex_item(doctype, txt, searchfield, start, page_len, filters):
    """Search query for an Annex's `annex_item`."""
    return _representative_item_query("Annex", txt, searchfield, start, page_len)


def _representative_item_query(current_doctype, txt, searchfield, start, page_len):
    """Shared picker query for a representative-Item doctype, driven entirely by
    REPRESENTATIVE_ITEM_DOCTYPES: offers non-stock Items (and non-fixed-asset where
    configured) that aren't disabled and aren't already used as the representative
    Item of another active such doctype — keeping Butler Bundle / Amenity / Annex
    items mutually exclusive (in step with their unique item fields)."""
    config = REPRESENTATIVE_ITEM_DOCTYPES[current_doctype]
    item = frappe.qb.DocType("Item")

    base_condition = (item.is_stock_item == 0) & (item.disabled == 0)
    if config["disallow_fixed_asset"]:
        base_condition &= item.is_fixed_asset == 0

    query = (
        frappe.qb.from_(item)
        .select(item.name, item.item_name)
        .where(base_condition)
        .where(
            Criterion.any(
                [item[fieldname].like(f"%{txt}%") for fieldname in _search_fields(searchfield)]
            )
        )
        .limit(page_len)
        .offset(start)
    )

    for exclude_doctype, item_field in _picker_exclude_doctypes(current_doctype).items():
        query = query.where(item.name.notin(_items_used_as(exclude_doctype, item_field)))

    return query.run()


def _picker_exclude_doctypes(current_doctype):
    """`doctype -> item_field` whose used Items the picker must anti-join out.

    Always the OTHER representative doctypes (mutual exclusivity). Also this doctype
    itself when `locked_after_save` (e.g. Butler Bundle) — safe there since the field
    can't be edited later, and it stops a new record reusing an already-taken Item.
    Unlocked doctypes skip self-exclusion so editing doesn't hide the current value
    (their own uniqueness is enforced by the unique item field)."""
    return {
        doctype: config["item_field"]
        for doctype, config in REPRESENTATIVE_ITEM_DOCTYPES.items()
        if doctype != current_doctype or config.get("locked_after_save")
    }


def _search_fields(searchfield):
    """Item fields to match the typed text against, mirroring ERPNext's Product
    Bundle search query: the caller's searchfield, or the Item's configured search
    fields when it's unset / the default `name`, always including `name`."""
    if not searchfield or searchfield == "name":
        searchfield = frappe.get_meta("Item").get("search_fields")

    fields = searchfield.split(",")
    fields.append("name")
    return [fieldname.strip() for fieldname in fields if fieldname.strip()]


def _items_used_as(doctype, item_field):
    """Subquery of Items already used as `item_field` on an active row of `doctype`
    — anti-joined out of an item picker. Doctypes without a `disabled` field
    contribute all their rows."""
    table = frappe.qb.DocType(doctype)
    query = frappe.qb.from_(table).select(table[item_field])
    if frappe.get_meta(doctype).has_field("disabled"):
        query = query.where(table.disabled == 0)
    return query
