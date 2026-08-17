# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from butler.utils.validations import validate_representative_item


class ButlerBundle(Document):
    def validate(self):
        # bundle_item must be a non-stock, non-fixed-asset Item not already backing
        # an active Amenity or Annex (Bundle / Amenity / Annex items are mutually
        # exclusive). Policy lives in REPRESENTATIVE_ITEM_DOCTYPES.
        validate_representative_item(self)


@frappe.whitelist()
def get_bundle_breakdown(bundle):
    """A Bundle's per-category amenity allowance — the single source of truth used
    by both the Butler Quotation (to fill its read-only Bundle Items breakup and
    drive the exact-count validation) and the Facility Builder (palette category
    caps). The allowance lives inversely on Amenity Category -> Bundles, so we read
    every Amenity Category Bundle row that points back to this bundle.

    Returns [{"amenity_category": <category>, "amenity_count": <int>}, ...].
    """
    if not bundle:
        return []
    return frappe.get_all(
        "Amenity Category Bundle",
        filters={"parenttype": "Amenity Category", "bundle_name": bundle},
        fields=["parent as amenity_category", "amenity_count"],
        order_by="parent asc",
    )
