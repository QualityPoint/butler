# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ButlerQuotation(Document):
    def before_validate(self):
        self.calculate_amenity_count()

    def validate(self):
        self.validate_duplicated_butler_quotation()

    def calculate_amenity_count(self):
        """
        Calculate the total amenity count from the amenities child table.
        Sums up the count field from all amenity rows.
        """
        total_count = 0

        if self.amenities:
            for amenity in self.amenities:
                total_count += amenity.count or 0

        self.amenity_count = total_count

    def validate_duplicated_butler_quotation(self):
        """
        Validate that no submitted service order exists for the same facility.
        Multiple draft orders are allowed, but only one submitted order per facility.
        """
        if not self.facility:
            frappe.throw(
                _("Facility must be set to validate duplicate Butler Quotations."), title="Facility Required")

        # Check if there's already a submitted butler quotation for this facility
        existing_submitted = frappe.db.exists(
            "Butler Quotation",
            {
                "facility": self.facility,
                "docstatus": 1,  # Submitted
                "name": ["!=", self.name]  # Exclude current document
            }
        )

        if existing_submitted:
            frappe.throw(
                f"A submitted Butler Quotation already exists for facility {self.facility}. "
                "Please cancel or amend the existing quotation before creating a new one.",
                title="Duplicate Butler Quotation"
            )


@frappe.whitelist()
def get_bundle_details(bundle_type):
    """
    Get bundle price and amenity categories for the selected bundle.

    Args:
            bundle_type: Name of the Butler Bundle

    Returns:
            dict: {
                    'bundle_price': float,
                    'amenity_categories': [
                            {
                                    'amenity_category': str,
                                    'number_of_amenities': int
                            }
                    ]
            }
    """
    if not bundle_type:
        return {}

    # Get bundle price
    bundle = frappe.get_doc("Butler Bundle", bundle_type)

    # Get all child table entries for this bundle
    bundle_entries = frappe.get_all(
        "Amenity Category Bundle",
        fields=["parent", "number_of_amenities"],
        filters={"bundle_name": bundle_type}
    )

    # Build result with amenity categories
    result_categories = []
    for entry in bundle_entries:
        result_categories.append({
            "amenity_category": entry.parent,
            "number_of_amenities": entry.number_of_amenities
        })

    return {
        "bundle_price": bundle.bundle_price,
        "max_discount": bundle.max_discount,
        "amenity_categories": result_categories
    }


@frappe.whitelist()
def get_amenity_details(amenity_name, facility=None):
    """
    Get amenity details for populating Facility Amenities child table.
    Only returns data for enabled amenities (disabled = 0).
    Can be called from client-side (Frappe UI or React frontend).

    Args:
        amenity_name: Name of the Amenity
        facility: Name of the Facility (optional, required for varied pricing)

    Returns:
        dict: {
            'amenity_name': str,
            'item': str,
            'amenity_category': str,
            'price': float,
            'lines': int,
            'image': str,
            'requires_number_of_floors': int,
            'is_dependant_amenity': int,
            'has_varied_price': int
        }
        Returns empty dict if amenity is disabled or doesn't exist.

    Example:
        amenity_details = get_amenity_details("AMN-0001", "FAC-0001")
    """
    if not amenity_name:
        return {}

    # Get amenity details only if it's enabled
    amenity = frappe.db.get_value(
        "Amenity",
        amenity_name,
        [
            "amenity_name",
            "amenity_category",
            "amenity_price",
            "image",
            "requires_number_of_floors",
            "is_dependant_amenity",
            "has_varied_price",
            "disabled"
        ],
        as_dict=True
    )

    # Return empty dict if amenity doesn't exist or is disabled
    if not amenity or amenity.disabled == 1:
        return {}

    # Determine the price - start with default amenity price
    price = amenity.amenity_price or 0

    # If amenity has varied price and facility is provided, get price from facility_prices
    if amenity.has_varied_price and facility:
        # Get facility_type from the facility
        facility_type = frappe.db.get_value(
            "Facility", facility, "facility_type")

        if facility_type:
            # Get price from facility_prices child table for this facility_type
            facility_price = frappe.db.get_value(
                "Facility Prices",
                {
                    "parent": amenity_name,
                    "facility_type": facility_type
                },
                "facility_price"
            )

            # Use facility-specific price if found, otherwise keep default price
            if facility_price is not None:
                price = facility_price
            # If not found in child table, price remains the default amenity_price

    return {
        "amenity_name": amenity.amenity_name,
        "amenity_category": amenity.amenity_category,
        "price": price,
        "image": amenity.image,
        "requires_number_of_floors": amenity.requires_number_of_floors or 0,
        "is_dependant_amenity": amenity.is_dependant_amenity or 0,
        "has_varied_price": amenity.has_varied_price or 0
    }


@frappe.whitelist()
def get_facility_specifications(facility):
    """
    Get facility specifications for populating Service Order facility fields.

    Args:
        facility: Name of the Facility

    Returns:
        dict: {
            'facility_type': str,
            'multistorey': int,
            'number_of_floors': int,
            'floor_area': float,
            'total_area': float
        }
        Returns empty dict if facility doesn't exist.

    Example:
        facility_specs = get_facility_specifications("FAC-0001")
    """
    if not facility:
        return {}

    # Get facility specifications
    facility_doc = frappe.db.get_value(
        "Facility",
        facility,
        [
            "facility_type",
            "multistorey",
            "number_of_floors",
            "floor_area",
            "total_area"
        ],
        as_dict=True
    )

    # Return empty dict if facility doesn't exist
    if not facility_doc:
        return {}

    return {
        "facility_type": facility_doc.facility_type or "",
        "multistorey": facility_doc.multistorey or 0,
        "number_of_floors": facility_doc.number_of_floors or 0,
        "floor_area": facility_doc.floor_area or 0.0,
        "total_area": facility_doc.total_area or 0.0
    }
