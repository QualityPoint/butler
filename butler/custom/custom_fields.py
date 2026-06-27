import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def custom_fields():
    """Butler specific custom fields that need to be added to the system."""
    return {
        "Quotation Item": [
            {
                "fieldname": "butler_quotation",
                "label": _("Butler Quotation"),
                "fieldtype": "Link",
                "options": "Butler Quotation",
                "is_system_generated": 1,
                "print_hide": 1,
                "no_copy": 1,
                "read_only": 1,
                "insert_after": "prevdoc_docname",
            },
            {
                "fieldname": "butler_quotation_item",
                "label": _("Butler Quotation Item"),
                "fieldtype": "Link",
                "options": "Butler Quotation Item",
                "is_system_generated": 1,
                "print_hide": 1,
                "no_copy": 1,
                "read_only": 1,
                "insert_after": "butler_quotation",
            },
        ],
        "Sales Order Item": [
            {
                "fieldname": "butler_quotation",
                "label": _("Butler Quotation"),
                "fieldtype": "Link",
                "options": "Butler Quotation",
                "is_system_generated": 1,
                "print_hide": 1,
                "no_copy": 1,
                "read_only": 1,
                "insert_after": "prevdoc_docname",
            },
            {
                "fieldname": "butler_quotation_item",
                "label": _("Butler Quotation Item"),
                "fieldtype": "Link",
                "options": "Butler Quotation Item",
                "is_system_generated": 1,
                "print_hide": 1,
                "no_copy": 1,
                "read_only": 1,
                "insert_after": "butler_quotation",
            },
        ]
    }


def make_custom_fields():
    """Create Butler specific custom fields"""
    create_custom_fields(custom_fields(), ignore_validate=True)


def delete_custom_fields():
    """
    :param custom_fields: a dict like `{'Company': [{fieldname: 'crn', ...}]}`
    """
    for doctype, fields in custom_fields().items():
        frappe.db.delete(
            "Custom Field",
            {
                "fieldname": ("in", [field["fieldname"] for field in fields]),
                "dt": doctype,
            },
        )

        frappe.clear_cache(doctype=doctype)
