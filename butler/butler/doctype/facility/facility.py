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
