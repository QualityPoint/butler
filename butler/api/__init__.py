# API module for Butler app

import frappe
from frappe import _
from frappe.model import no_value_fields


@frappe.whitelist()
def sort_options(doctype: str):
    """
    Get all sortable fields for a doctype.
    Returns list of fields with their labels and fieldnames.
    """
    fields = frappe.get_meta(doctype).fields
    fields = [field for field in fields if field.fieldtype not in no_value_fields]
    fields = [
        {
            "label": _(field.label),
            "value": field.fieldname,
            "fieldname": field.fieldname,
        }
        for field in fields
        if field.label and field.fieldname
    ]

    standard_fields = [
        {"label": "Name", "fieldname": "name"},
        {"label": "Created On", "fieldname": "creation"},
        {"label": "Last Modified", "fieldname": "modified"},
        {"label": "Modified By", "fieldname": "modified_by"},
        {"label": "Owner", "fieldname": "owner"},
    ]

    for field in standard_fields:
        field["label"] = _(field["label"])
        field["value"] = field["fieldname"]

    # Insert standard fields at the beginning
    fields = standard_fields + fields

    return fields


@frappe.whitelist()
def get_list_fields(doctype: str):
    """
    Get all available fields for list view columns.
    Similar to sort_options but includes more metadata.
    """
    fields = frappe.get_meta(doctype).fields
    fields = [field for field in fields if field.fieldtype not in no_value_fields]
    field_list = [
        {
            "label": _(field.label),
            "value": field.fieldname,
            "fieldname": field.fieldname,
            "fieldtype": field.fieldtype,
        }
        for field in fields
        if field.label and field.fieldname
    ]

    standard_fields = [
        {"label": "Name", "fieldname": "name", "fieldtype": "Data"},
        {"label": "Created On", "fieldname": "creation", "fieldtype": "Datetime"},
        {"label": "Last Modified", "fieldname": "modified", "fieldtype": "Datetime"},
        {"label": "Modified By", "fieldname": "modified_by", "fieldtype": "Link"},
        {"label": "Owner", "fieldname": "owner", "fieldtype": "Link"},
    ]

    for field in standard_fields:
        field["label"] = _(field["label"])
        field["value"] = field["fieldname"]

    # Insert standard fields at the beginning
    field_list = standard_fields + field_list

    return field_list
