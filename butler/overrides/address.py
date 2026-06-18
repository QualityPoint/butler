# Copyright (c) 2025, QP and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def validate(doc, method=None):
    validate_one_address_per_facility(doc)


def validate_one_address_per_facility(doc):
    """A Facility can be linked to only one Address.

    Butler's Facility is a flat doctype (no parent/sub-facility tree), so the
    only rule needed here is: block linking an Address to a Facility that is
    already linked to another Address.
    """
    facility_links = [link for link in doc.links if link.link_doctype == "Facility"]

    for link in facility_links:
        facility_name = link.link_name
        if not facility_name:
            continue

        existing = frappe.db.get_all(
            "Dynamic Link",
            filters={
                "parenttype": "Address",
                "link_doctype": "Facility",
                "link_name": facility_name,
                "parent": ("!=", doc.name),
            },
            pluck="parent",
            limit=1,
        )
        if existing:
            frappe.throw(
                _(
                    "Facility {0} is already linked to address {1}. "
                    "A facility can only have one address."
                ).format(frappe.bold(facility_name), frappe.bold(existing[0]))
            )
