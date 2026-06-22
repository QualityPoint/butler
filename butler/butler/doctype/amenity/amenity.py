# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from butler.utils.validations import validate_representative_item


class Amenity(Document):
    def validate(self):
        # amenity_item must be a non-stock Item not already backing an active Butler
        # Bundle or Annex (Bundle / Amenity / Annex items are mutually exclusive).
        validate_representative_item(self)
