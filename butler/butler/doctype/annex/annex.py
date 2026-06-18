# Copyright (c) 2025, QP and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from butler.utils.validations import validate_non_stock_item


class Annex(Document):
    def validate(self):
        self.validate_annex_item()

    def validate_annex_item(self):
        """Validate that annex_item is a non-stock item"""
        validate_non_stock_item(self.annex_item)
