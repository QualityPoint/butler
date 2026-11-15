import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.model.utils.user_settings import sync_user_settings

from butler.utils.schema_rename import (
	rename_column,
	rename_columns,
	rename_single_fields,
	rename_table_field,
	update_references,
)

DOCTYPES = {
	"Annex": "Device",
	"Annex Category": "Device Category",
	"Annex Price": "Device Price",
	"Annex Type": "Device Type",
	"Amenity Annex Item": "Amenity Device Item",
}

# By new DocType name: the DocTypes are renamed first.
COLUMNS = {
	"Device": {
		"annex_item": "device_item",
		"annex_name": "device_name",
		"annex_category": "device_category",
		"annex_type": "device_type",
	},
	"Amenity Device Item": {
		"annex": "device",
		"annex_name": "device_name",
		"annex_category": "device_category",
		"annex_type": "device_type",
	},
	"Device Price": {"annex": "device", "annex_name": "device_name"},
	"Butler Quotation Item": {
		"annex": "device",
		"annex_name": "device_name",
		"annex_category": "device_category",
		"annex_type": "device_type",
		"annex_description": "device_description",
		"annex_icon": "device_icon",
		"annex_section": "device_section",
		"annexes_customised": "devices_customised",
		"is_extra_annex": "is_extra_device",
		"annex_quantity": "device_quantity",
		"annex_uom": "device_uom",
		"annex_stock_uom": "device_stock_uom",
		"annex_price_list": "device_price_list",
		"annex_price": "device_price",
		"annex_amount": "device_amount",
		"qtn_annex_price": "qtn_device_price",
		"qtn_annex_net_price": "qtn_device_net_price",
		"qtn_annex_amount": "qtn_device_amount",
		"qtn_annex_net_amount": "qtn_device_net_amount",
		"base_annex_price": "base_device_price",
		"base_annex_net_price": "base_device_net_price",
		"base_annex_amount": "base_device_amount",
		"base_annex_net_amount": "base_device_net_amount",
	},
}
SETTINGS = {
	"maintain_annex_price_action": "maintain_device_price_action",
	"role_to_override_annex_price_stop_action": "role_to_override_device_price_stop_action",
}


def execute():
	"""Rename Annex to Device: the DocTypes, then their fields, in place, before the new
	DocType files sync. Record names are left as they are."""
	rename_doctypes()

	for doctype, renames in COLUMNS.items():
		if frappe.db.table_exists(doctype):
			rename_columns(doctype, renames)

	if frappe.db.table_exists("Amenity Device Item"):
		rename_table_field("Amenity", "Amenity Device Item", "annexes", "devices")

	rename_single_fields("Butler Settings", SETTINGS)
	rename_item_flag()


def rename_doctypes():
	# In developer mode Frappe re-saves every DocType linking to the renamed one, and a save
	# writes its JSON into the app; production has developer mode off, so match it here.
	developer_mode = frappe.conf.developer_mode
	frappe.conf.developer_mode = 0
	try:
		for old, new in DOCTYPES.items():
			if not frappe.db.exists("DocType", old):
				continue
			if frappe.db.exists("DocType", new):
				frappe.throw(_("Both DocTypes {0} and {1} exist; merge them by hand first.").format(old, new))
			frappe.rename_doc("DocType", old, new, force=True, show_alert=False, rebuild_search=False)
			move_user_settings(old, new)
	finally:
		frappe.conf.developer_mode = developer_mode


def move_user_settings(old, new):
	# rename_doc moves link values only; saved list filters and columns are keyed by DocType
	sync_user_settings()
	frappe.db.sql("update `__UserSettings` set doctype=%s where doctype=%s", (new, old))
	frappe.cache.delete_keys("_user_settings")


def rename_item_flag():
	"""Item's `is_annex` custom field becomes `is_device`.

	Frappe won't rename a system-generated custom field, so the column is renamed and the
	field record replaced with Butler's current definition.
	"""
	from butler.custom.custom_fields import custom_fields

	old_field = frappe.db.get_value("Custom Field", {"dt": "Item", "fieldname": "is_annex"})
	if not old_field:
		return

	if frappe.db.has_column("Item", "is_annex"):
		if frappe.db.has_column("Item", "is_device"):
			frappe.throw(_("Item has both columns is_annex and is_device; merge them by hand first."))
		rename_column("Item", "is_annex", "is_device")
	update_references("Item", "is_annex", "is_device")

	frappe.delete_doc("Custom Field", old_field, force=True)
	is_device = [f for f in custom_fields()["Item"] if f["fieldname"] == "is_device"]
	create_custom_fields({"Item": is_device}, ignore_validate=True)
