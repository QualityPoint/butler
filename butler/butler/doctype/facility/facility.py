# Copyright (c) 2025, QP and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class Facility(Document):
    def validate(self):
        self.validate_facility_for()
        self.validate_facility_specifications()
        self.calculate_total_area()

    def validate_facility_for(self):
        """Validate that facility_for is either Customer or Lead"""
        allowed_doctypes = ["Customer", "Lead"]
        if self.facility_for not in allowed_doctypes:
            frappe.throw(
                _("Facility For must be either {0}").format(
                    _(" or ").join([frappe.bold(dt) for dt in allowed_doctypes])),
                frappe.ValidationError
            )

    def validate_facility_specifications(self):
        """Validate facility specification fields"""
        if self.multistorey:
            # Validate number_of_floors > 1
            if not self.number_of_floors or self.number_of_floors <= 1:
                frappe.throw(
                    _("Number of Floors must be greater than 1 for multi-storey facilities"),
                    frappe.ValidationError
                )

            # Validate floor_area > 0
            if not self.floor_area or self.floor_area <= 0:
                frappe.throw(
                    _("Floor Area must be greater than 0"),
                    frappe.ValidationError
                )
        else:
            # Clear multi-storey fields for non-multistorey
            self.number_of_floors = None
            self.floor_area = None

            # Validate total_area > 0 for non-multistorey
            if not self.total_area or self.total_area <= 0:
                frappe.throw(
                    _("Total Area must be greater than 0"),
                    frappe.ValidationError
                )

    def calculate_total_area(self):
        """Calculate total area for multi-storey facilities"""
        if self.multistorey:
            if self.number_of_floors and self.floor_area:
                self.total_area = self.floor_area * self.number_of_floors
