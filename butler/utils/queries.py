import frappe
from frappe import _


@frappe.whitelist()
def get_item_name(item):
    return frappe.db.get_value("Item", item, "item_name")
