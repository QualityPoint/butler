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
