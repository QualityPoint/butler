# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class LightSystem(Document):
	def validate(self):
		if not self.is_default and not self._get_previous_default():
			self.is_default = 1

	def on_update(self):
		if self.is_default and (previous_default := self._get_previous_default()):
			frappe.db.set_value("Light System", previous_default, "is_default", 0)

	def on_trash(self):
		if self.is_default:
			frappe.throw(_("Default Light System cannot be deleted"))

	def _get_previous_default(self) -> str | None:
		return frappe.db.get_value("Light System", {"is_default": 1, "name": ("!=", self.name)})
