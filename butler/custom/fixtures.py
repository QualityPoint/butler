import frappe
from frappe import _
from frappe.desk.page.setup_wizard.setup_wizard import make_records


def make_fixtures():
    """Create default fixture data for the app"""
    records = [
        # Annex Category
        {
            "doctype": "Annex Category",
            "category_name": _("Room Control & User Interface"),
        },
        {
            "doctype": "Annex Category",
            "category_name": _("Curtain Control"),
        },
        {
            "doctype": "Annex Category",
            "category_name": _("Sensing & Climate"),
        },
        {
            "doctype": "Annex Category",
            "category_name": _("System Core"),
        },
        {
            "doctype": "Annex Category",
            "category_name": _("Connected Home - IT Networking Upgrade"),
        },
        # Facility Type
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
        # Floor Type
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
        },
        {
            "doctype": "Floor Type",
            "floor_name": _("Mezzanine"),
        },
        # light system
        {
            "doctype": "Light System",
            "system_name": _("Relay"),
            "is_default": 1,
        },
        {
            "doctype": "Light System",
            "system_name": _("DALI"),
            "is_default": 0,
        },
        {
            "doctype": "Light System",
            "system_name": _("Dimmer"),
            "is_default": 0,
        }
    ]
    # Now create other fixtures
    make_records(records)
