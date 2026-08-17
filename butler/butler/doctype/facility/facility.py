# Copyright (c) 2025, QualityPoint and contributors
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
        self.validate_allowed_link_types()
        self.validate_single_party_per_type()

    def validate_allowed_link_types(self):
        """A Facility may only be linked to a Customer or a Lead."""
        allowed_link_types = ("Customer", "Lead")
        for link in self.links:
            if link.link_doctype not in allowed_link_types:
                frappe.throw(
                    _("A Facility can only be linked to a {0}, not {1}.").format(
                        _(" or ").join(_(dt) for dt in allowed_link_types),
                        _(link.link_doctype),
                    )
                )

    def validate_single_party_per_type(self):
        """A Facility may be linked to at most one Customer and one Lead."""
        allowed_link_types = ("Customer", "Lead")
        counts = {}
        for link in self.links:
            counts[link.link_doctype] = counts.get(link.link_doctype, 0) + 1

        for party_type in allowed_link_types:
            if counts.get(party_type, 0) > 1:
                frappe.throw(
                    _("A Facility can be linked to only one {0}.").format(_(party_type))
                )
