# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class DevicePrice(Document):
	pass


def upsert_device_price(device, amenity, uom, rate, currency, facility_type=None):
	"""Create or update the Device Price for (device, amenity, facility_type): insert a
	new record if none exists yet, update the existing one in place if its uom/rate/
	currency changed, or leave it untouched if they're already identical (no
	duplicates).

	`facility_type` left unset targets the standard, non-facility-specific price;
	pass one to target/create a facility-type override instead.
	"""
	facility_type = facility_type or ""
	filters = {
		"device": device,
		"amenity": amenity,
		"facility_type": facility_type,
	}
	existing_name = frappe.db.get_value("Device Price", filters, "name")

	if not existing_name:
		frappe.get_doc(
			{
				"doctype": "Device Price",
				"device": device,
				"amenity": amenity,
				"facility_type": facility_type,
				"uom": uom,
				"rate": rate,
				"currency": currency,
			}
		).insert(ignore_permissions=True)
		return

	device_price = frappe.get_doc("Device Price", existing_name)
	if device_price.uom == uom and flt(device_price.rate) == flt(rate) and device_price.currency == currency:
		return

	device_price.uom = uom
	device_price.rate = rate
	device_price.currency = currency
	device_price.save(ignore_permissions=True)


@frappe.whitelist()
def get_device_price(device, amenity, facility_type=None):
	"""The Device Price that governs a device on a given amenity, for a facility type.

	A row scoped to `facility_type` wins; otherwise the standard row (`facility_type = ""`)
	applies. This is the successor to the old `Amenity.facility_type_prices` lookup — the
	override now lives per device rather than per amenity, and the mere existence of a
	facility-type row is what makes a price changeable (there is no `has_changeable_price`
	gate any more).

	Returns the Device Price as a dict (name, rate, uom, currency), or None when the
	device/amenity pair was never priced.
	"""
	if not (device and amenity):
		return None

	# facility-type override first, then the standard row
	for scope in ([facility_type] if facility_type else []) + [""]:
		match = frappe.db.get_value(
			"Device Price",
			{"device": device, "amenity": amenity, "facility_type": scope},
			["name", "rate", "uom", "currency"],
			as_dict=True,
		)
		if match:
			return match

	return None


@frappe.whitelist()
def create_facility_type_device_price(amenity, device, uom, currency, facility_type, rate):
	"""Handler for the Amenity form's per-row "Facility Type Pricing" button: creates
	(or updates, per upsert_device_price) the Device Price for this device/amenity,
	scoped to the chosen Facility Type."""
	if not facility_type:
		frappe.throw(_("Facility Type is required"))

	upsert_device_price(
		device=device,
		amenity=amenity,
		uom=uom,
		rate=flt(rate),
		currency=currency,
		facility_type=facility_type,
	)
