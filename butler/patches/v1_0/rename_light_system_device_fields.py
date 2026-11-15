import frappe

from butler.utils.schema_rename import rename_columns, rename_table_field

# "Device" now names the former Annex, so every light-system field says "light system device".
COLUMNS = {
	"Light System Device": {"device_name": "light_system_device_name"},
	"Light System Device Item": {"device": "light_system_device"},
	"Quotation Light System Item": {
		"device": "light_system_device",
		"device_count": "light_system_device_count",
	},
	"Light System": {"device_configuration_section": "light_system_devices_section"},
}
TABLES = [
	("Butler Quotation", "Quotation Light System Item", "devices", "light_system_devices"),
	("Light System", "Light System Device Item", "devices", "light_system_devices"),
]


def execute():
	"""Rename the light-system `device` fields to `light_system_device` ones, in place."""
	for doctype, renames in COLUMNS.items():
		if frappe.db.table_exists(doctype):
			rename_columns(doctype, renames)

	for parent, child, old, new in TABLES:
		if frappe.db.table_exists(child):
			rename_table_field(parent, child, old, new)
