# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class AnnexPrice(Document):
	pass


def upsert_annex_price(annex, amenity, uom, rate, currency, facility_type=None):
	"""Create or update the Annex Price for (annex, amenity, facility_type): insert a
	new record if none exists yet, update the existing one in place if its uom/rate/
	currency changed, or leave it untouched if they're already identical (no
	duplicates).

	`facility_type` left unset targets the standard, non-facility-specific price;
	pass one to target/create a facility-type override instead.
	"""
	facility_type = facility_type or ""
	filters = {
		"annex": annex,
		"amenity": amenity,
		"facility_type": facility_type,
	}
	existing_name = frappe.db.get_value("Annex Price", filters, "name")

	if not existing_name:
		frappe.get_doc(
			{
				"doctype": "Annex Price",
				"annex": annex,
				"amenity": amenity,
				"facility_type": facility_type,
				"uom": uom,
				"rate": rate,
				"currency": currency,
			}
		).insert(ignore_permissions=True)
		return

	annex_price = frappe.get_doc("Annex Price", existing_name)
	if annex_price.uom == uom and flt(annex_price.rate) == flt(rate) and annex_price.currency == currency:
		return

	annex_price.uom = uom
	annex_price.rate = rate
	annex_price.currency = currency
	annex_price.save(ignore_permissions=True)


@frappe.whitelist()
def get_annex_price(annex, amenity, facility_type=None):
	"""The Annex Price that governs an annex on a given amenity, for a facility type.

	A row scoped to `facility_type` wins; otherwise the standard row (`facility_type = ""`)
	applies. This is the successor to the old `Amenity.facility_type_prices` lookup — the
	override now lives per annex rather than per amenity, and the mere existence of a
	facility-type row is what makes a price changeable (there is no `has_changeable_price`
	gate any more).

	Returns the Annex Price as a dict (name, rate, uom, currency), or None when the
	annex/amenity pair was never priced.
	"""
	if not (annex and amenity):
		return None

	# facility-type override first, then the standard row
	for scope in ([facility_type] if facility_type else []) + [""]:
		match = frappe.db.get_value(
			"Annex Price",
			{"annex": annex, "amenity": amenity, "facility_type": scope},
			["name", "rate", "uom", "currency"],
			as_dict=True,
		)
		if match:
			return match

	return None


@frappe.whitelist()
def create_facility_type_annex_price(amenity, annex, uom, currency, facility_type, rate):
	"""Handler for the Amenity form's per-row "Facility Type Pricing" button: creates
	(or updates, per upsert_annex_price) the Annex Price for this annex/amenity,
	scoped to the chosen Facility Type."""
	if not facility_type:
		frappe.throw(_("Facility Type is required"))

	upsert_annex_price(
		annex=annex,
		amenity=amenity,
		uom=uom,
		rate=flt(rate),
		currency=currency,
		facility_type=facility_type,
	)
