import frappe
from frappe import _

# Doctypes whose "representative Item" is mutually exclusive across all of them: an
# Item can back at most one active Butler Bundle / Amenity / Annex. For each, this
# is the single source of truth for:
#   - item_field          : the Item link field on that doctype
#   - disallow_fixed_asset : whether a Fixed Asset is rejected (Butler Bundle mirrors
#                            ERPNext's Product Bundle, which forbids fixed-asset parents)
#   - locked_after_save    : whether the field is read-only once saved (Butler Bundle,
#                            like Product Bundle). Such doctypes also exclude their own
#                            used items from the picker — safe because editing is locked.
# Shared with the item search queries in butler.utils.queries, so adding a doctype
# here wires up both its validation and its picker.
REPRESENTATIVE_ITEM_DOCTYPES = {
    "Butler Bundle": {
        "item_field": "bundle_item",
        "disallow_fixed_asset": True,
        "locked_after_save": True,
    },
    "Amenity": {"item_field": "amenity_item", "disallow_fixed_asset": False},
    "Annex": {"item_field": "annex_item", "disallow_fixed_asset": False},
}


def validate_representative_item(doc):
    """Run every guard for a representative-Item doctype's Item in one place: it must
    be a non-stock Item (and, where configured, not a Fixed Asset) and must not
    already back another active representative-Item doctype — keeping Butler Bundle /
    Amenity / Annex items mutually exclusive.

    Driven entirely by REPRESENTATIVE_ITEM_DOCTYPES, so each controller's validate()
    is a single call and adding a doctype to the registry wires it up automatically.
    """
    config = REPRESENTATIVE_ITEM_DOCTYPES[doc.doctype]
    item_code = doc.get(config["item_field"])
    if not item_code:
        return

    validate_non_stock_item(item_code)
    if config["disallow_fixed_asset"]:
        validate_non_fixed_asset(item_code)
    _validate_item_not_used_elsewhere(item_code, doc.doctype)


def validate_non_stock_item(item_code):
    """Validate that the Item exists, isn't disabled, and is a non-stock Item.

    Raises:
        frappe.DoesNotExistError: If the Item doesn't exist
        frappe.ValidationError: If the Item is disabled or a stock item
    """
    if not item_code:
        return

    item = frappe.db.get_value("Item", item_code, ["disabled", "is_stock_item"], as_dict=True)

    if item is None:
        _throw(_("Item {0} does not exist").format(frappe.bold(item_code)), frappe.DoesNotExistError)

    if item.disabled:
        _throw(_("Item {0} is disabled").format(frappe.bold(item_code)))

    if item.is_stock_item:
        _throw(_("Item {0} must be a non-stock item").format(frappe.bold(item_code)))


def validate_non_fixed_asset(item_code):
    """Validate the Item isn't a Fixed Asset (mirrors ERPNext's Product Bundle
    validate_main_item guard for a bundle's parent Item).

    Raises:
        frappe.ValidationError: If the Item is a Fixed Asset
    """
    if not item_code:
        return

    if frappe.db.get_value("Item", item_code, "is_fixed_asset"):
        _throw(_("Item {0} must not be a Fixed Asset").format(frappe.bold(item_code)))


def _validate_item_not_used_elsewhere(item_code, current_doctype):
    """Throw if the Item already backs an active row of any OTHER representative-Item
    doctype. Doctypes without a `disabled` field are matched on the Item alone."""
    for doctype, config in REPRESENTATIVE_ITEM_DOCTYPES.items():
        if doctype == current_doctype:
            continue

        filters = {config["item_field"]: item_code}
        if frappe.get_meta(doctype).has_field("disabled"):
            filters["disabled"] = 0

        existing = frappe.db.get_value(doctype, filters, "name")
        if existing:
            _throw(
                _("Item {0} is already used by {1} {2}, so it can't be used here").format(
                    frappe.bold(item_code), _(doctype), frappe.bold(existing)
                )
            )


def _throw(message, exc=frappe.ValidationError):
    frappe.throw(message, exc)
