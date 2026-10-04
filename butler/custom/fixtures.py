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
        # light system device (before the light systems that list them)
        {
            "doctype": "Light System Device",
            "device_name": "Relay Actuator 12CH",
            "description": "12-channel switching actuator for on/off lighting circuits.",
            "warranty": 2,
            "warranty_uom": "Years",
        },
        {
            "doctype": "Light System Device",
            "device_name": "DALI Gateway 64",
            "description": "DALI gateway driving one DALI line of up to 64 addressable ballasts.",
            "warranty": 2,
            "warranty_uom": "Years",
        },
        {
            "doctype": "Light System Device",
            "device_name": "Universal Dimmer 4CH",
            "description": "4-channel universal dimming actuator for leading/trailing edge loads.",
            "warranty": 2,
            "warranty_uom": "Years",
        },
        # light system — only when missing. make_records inserts with ignore_if_duplicate,
        # which skips an existing parent but still inserts its child rows (Document.insert),
        # and this runs on every migrate (after_migrate): without the condition each migrate
        # added another copy of every system's Devices rows.
        {
            "doctype": "Light System",
            "system_name": _("Relay"),
            "is_default": 1,
            "devices": [{"device": "Relay Actuator 12CH", "channels_count": 12, "is_default": 1}],
            "__condition": lambda: not frappe.db.exists("Light System", _("Relay")),
        },
        {
            "doctype": "Light System",
            "system_name": _("DALI"),
            "is_default": 0,
            "devices": [{"device": "DALI Gateway 64", "channels_count": 64, "is_default": 1}],
            "__condition": lambda: not frappe.db.exists("Light System", _("DALI")),
        },
        {
            "doctype": "Light System",
            "system_name": _("Dimmer"),
            "is_default": 0,
            "devices": [{"device": "Universal Dimmer 4CH", "channels_count": 4, "is_default": 1}],
            "__condition": lambda: not frappe.db.exists("Light System", _("Dimmer")),
        }
    ]
    # Now create other fixtures
    make_records(records)
