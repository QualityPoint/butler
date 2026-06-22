# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from butler.utils.validations import validate_representative_item


class ButlerBundle(Document):
    def validate(self):
        # bundle_item must be a non-stock, non-fixed-asset Item not already backing
        # an active Amenity or Annex (Bundle / Amenity / Annex items are mutually
        # exclusive). Policy lives in REPRESENTATIVE_ITEM_DOCTYPES.
        validate_representative_item(self)
