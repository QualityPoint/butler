# Copyright (c) 2025, QP and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.contacts.address_and_contact import load_address_and_contact, set_link_title
from frappe.model.document import Document


class Facility(Document):
    def onload(self):
        load_address_and_contact(self)

    def validate(self):
        set_link_title(self)
        self.validate_single_party_per_type()

    def validate_single_party_per_type(self):
        """A Facility may be linked to at most one Customer and one Lead."""
        counts = {}
        for link in self.links:
            counts[link.link_doctype] = counts.get(link.link_doctype, 0) + 1

        for party_type in ("Customer", "Lead"):
            if counts.get(party_type, 0) > 1:
                frappe.throw(
                    _("A Facility can be linked to only one {0}.").format(_(party_type))
                )
