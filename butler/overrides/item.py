# Copyright (c) 2025, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint

# (flag on the Item, wrapper doctype, the wrapper's Link field back to the Item).
# Single source for the Item -> Butler wrapper mapping: add a wrapper here and every
# sync below picks it up.
BUTLER_WRAPPERS = (
    ("is_amenity", "Amenity", "amenity"),
    ("is_annex", "Annex", "annex_item"),
)


def validate(doc, method=None):
    validate_amenity_annex(doc)
    validate_butler_item(doc)

def before_save(doc, method=None):
    sync_wrapper_disabled(doc)

def validate_amenity_annex(doc):
    """Validate that an Item cannot be both an Amenity and an Annex.

    This is a business rule for Butler's Item doctype. An Item can be either
    an Amenity or an Annex, but not both.
    """
    if doc.is_amenity and doc.is_annex:
        frappe.throw(
            _("An Item cannot be both an Amenity and an Annex. Please select only one.")
        )

def validate_butler_item(doc):
    """Validate that a Butler Item does not carry attributes reserved for stock/asset items.

    This is a business rule for Butler's Item doctype. A Butler Item cannot be
    a Stock Item, a Fixed Asset, a Customer Provided Item, or have variants.
    """
    field_labels = {
        "is_stock_item": _("Is Stock Item"),
        "is_fixed_asset": _("Is Fixed Asset"),
        "is_customer_provided_item": _("Is Customer Provided Item"),
        "has_variants": _("Has Variants"),
    }

    invalid_attributes = [label for fieldname, label in field_labels.items() if doc.get(fieldname)]

    if invalid_attributes:
        attributes_html = "<ul>" + "".join(f"<li>{attribute}</li>" for attribute in invalid_attributes) + "</ul>"
        frappe.throw(
            _("A Butler Item cannot have the following attributes enabled: {0}").format(attributes_html)
        )

def sync_wrapper_disabled(doc):
    """Mirror the Item's `disabled` onto its Butler wrapper (Amenity / Annex).

    The wrapper's `disabled` is a hidden, read-only copy — the Item is the source of
    truth — so it's written straight to the database: there are no wrapper-side hooks
    worth running for a flag flip (the Amenity's would re-price its whole annex table),
    and `modified` is deliberately left alone so the flip can't collide with a form
    someone already has open.

    Skipped unless `disabled` actually changed, and on insert — the wrapper links to the
    Item, so it cannot exist yet.
    """
    if doc.is_new() or not doc.has_value_changed("disabled"):
        return

    for flag, doctype, item_field in BUTLER_WRAPPERS:
        if not doc.get(flag):
            continue

        # An Item is only ever one of the two (validate_amenity_annex), and item_field is
        # unique on the wrapper — so this touches exactly one row, or none at all when the
        # Item carries the flag but its wrapper hasn't been created yet.
        frappe.db.set_value(
            doctype,
            {item_field: doc.name},
            "disabled",
            cint(doc.disabled),
            update_modified=False,
        )
        return