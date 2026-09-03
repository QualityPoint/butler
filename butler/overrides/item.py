# Copyright (c) 2025, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def validate(doc, method=None):
    validate_amenity_annex(doc)
    validate_butler_item(doc)

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
