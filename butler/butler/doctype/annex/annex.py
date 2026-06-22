# Copyright (c) 2025, QP and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from butler.utils.validations import validate_representative_item


class Annex(Document):
    def validate(self):
        # annex_item must be a non-stock Item not already backing an active Butler
        # Bundle or Amenity (Bundle / Amenity / Annex items are mutually exclusive).
        validate_representative_item(self)
