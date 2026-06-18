import frappe
from frappe import _
from frappe.desk.page.setup_wizard.setup_wizard import make_records


def make_fixtures():
    """Create default fixture data for the app"""
    records = [
        # facility type
        {
            "doctype": "Facility Type",
            "facility_type": _("Apartment"),
        },
        {
            "doctype": "Facility Type",
            "facility_type": _("Villa"),
        },
        {
            "doctype": "Facility Type",
            "facility_type": _("Palace"),
        },
        # floor type
        {
            "doctype": "Floor Type",
            "floor_name": _("Ground Floor"),
        },
        {
            "doctype": "Floor Type",
            "floor_name": _("First Floor"),
        },
        {
            "doctype": "Floor Type",
            "floor_name": _("Second Floor"),
        },
        {
            "doctype": "Floor Type",
            "floor_name": _("Third Floor"),
        },
        {
            "doctype": "Floor Type",
            "floor_name": _("Fourth Floor"),
        },
        {
            "doctype": "Floor Type",
            "floor_name": _("B1"),
        },
        {
            "doctype": "Floor Type",
            "floor_name": _("B2"),
        },
        {
            "doctype": "Floor Type",
            "floor_name": _("B3"),
        },
        {
            "doctype": "Floor Type",
            "floor_name": _("Basement"),
        }
    ]
    # Now create other fixtures
    make_records(records)
