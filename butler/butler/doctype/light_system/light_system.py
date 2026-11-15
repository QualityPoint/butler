# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class LightSystem(Document):
	def validate(self):
		if not self.is_default and not self._get_previous_default():
			self.is_default = 1

		self.validate_light_system_devices()

	def validate_light_system_devices(self):
		"""Each light system device appears once in this system, and exactly one of them is the default.

		Duplicates are checked within this document only — the same light system device may be fitted to
		any number of Light Systems. A system with no default ticked adopts its first row.
		"""
		seen = set()
		defaults = []

		for row in self.light_system_devices:
			# an empty row is left to the mandatory check to report
			if row.light_system_device and row.light_system_device in seen:
				frappe.throw(
					_("Row #{0}: {1} is already in the Light System Devices table.").format(
						row.idx, frappe.bold(row.light_system_device)
					),
					title=_("Duplicate Light System Device"),
				)
			seen.add(row.light_system_device)

			if row.is_default:
				defaults.append(row)

		if len(defaults) > 1:
			frappe.throw(
				_("Only one light system device can be the default. Rows {0} are all marked as default.").format(
					", ".join(f"#{row.idx}" for row in defaults)
				),
				title=_("Multiple Default Light System Devices"),
			)

		if not defaults and self.light_system_devices:
			self.light_system_devices[0].is_default = 1

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
	`{system: [{light_system_device, channels_count, is_default}]}`, in table order."""
	light_system_devices = {}
	for row in frappe.get_all(
		"Light System Device Item",
		filters={"parenttype": "Light System", "parentfield": "light_system_devices"},
		fields=["parent", "light_system_device", "channels_count", "is_default"],
		order_by="parent asc, idx asc",
	):
		light_system_devices.setdefault(row.parent, []).append(
			{"light_system_device": row.light_system_device, "channels_count": row.channels_count, "is_default": row.is_default}
		)
	return light_system_devices
