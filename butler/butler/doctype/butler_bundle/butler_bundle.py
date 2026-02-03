# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from butler.utils.validations import validate_non_stock_item


class ButlerBundle(Document):
    def validate(self):
        self.validate_bundle_item()

    def validate_bundle_item(self):
        """Validate that bundle_item is a non-stock item"""
        validate_non_stock_item(self.bundle_item)
