import frappe
from frappe import _


def validate_non_stock_item(item_code):
    """
    Validate that the given item is a non-stock item.

    Args:
        item_code (str): The item code to validate

    Raises:
        frappe.ValidationError: If item is a stock item or doesn't exist
    """
    if not item_code:
        return

    item = frappe.db.get_value(
        "Item", item_code, ["disabled", "is_stock_item"], as_dict=True)

    if item is None:
        frappe.throw(
            _("Item {0} does not exist").format(frappe.bold(item_code)),
            frappe.DoesNotExistError
        )

    if item.disabled:
        frappe.throw(
            _("Item {0} is disabled").format(frappe.bold(item_code)),
            frappe.ValidationError
        )

    if item.is_stock_item:
        frappe.throw(
            _("Item {0} must be a non-stock item").format(frappe.bold(item_code)),
            frappe.ValidationError
        )
