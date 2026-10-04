# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class LightSystem(Document):
	def validate(self):
		if not self.is_default and not self._get_previous_default():
			self.is_default = 1

		self.validate_devices()

	def validate_devices(self):
		"""Each device appears once in this system, and exactly one of them is the default.

		Duplicates are checked within this document only — the same device may be fitted to
		any number of Light Systems. A system with no default ticked adopts its first row.
		"""
		seen = set()
		defaults = []

		for row in self.devices:
			# an empty device is left to the mandatory check to report
			if row.device and row.device in seen:
				frappe.throw(
					_("Row #{0}: {1} is already in the Devices table.").format(
						row.idx, frappe.bold(row.device)
					),
					title=_("Duplicate Device"),
				)
			seen.add(row.device)

			if row.is_default:
				defaults.append(row)

		if len(defaults) > 1:
			frappe.throw(
				_("Only one device can be the default. Rows {0} are all marked as default.").format(
					", ".join(f"#{row.idx}" for row in defaults)
				),
				title=_("Multiple Default Devices"),
			)

		if not defaults and self.devices:
			self.devices[0].is_default = 1

	def on_update(self):
		if self.is_default and (previous_default := self._get_previous_default()):
			frappe.db.set_value("Light System", previous_default, "is_default", 0)

	def on_trash(self):
		if self.is_default:
			frappe.throw(_("Default Light System cannot be deleted"))

	def _get_previous_default(self) -> str | None:
		return frappe.db.get_value("Light System", {"is_default": 1, "name": ("!=", self.name)})


@frappe.whitelist()
def get_light_system_devices() -> dict:
	"""Every Light System's devices for the Facility Builder, in one round trip:
	`{system: [{device, channels_count, is_default}]}`, in table order."""
	devices = {}
	for row in frappe.get_all(
		"Light System Device Item",
		filters={"parenttype": "Light System", "parentfield": "devices"},
		fields=["parent", "device", "channels_count", "is_default"],
		order_by="parent asc, idx asc",
	):
		devices.setdefault(row.parent, []).append(
			{"device": row.device, "channels_count": row.channels_count, "is_default": row.is_default}
		)
	return devices
