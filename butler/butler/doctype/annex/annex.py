# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Annex(Document):
	pass


@frappe.whitelist()
def get_annex_default_uom(annex):
	"""The UOM an annex is transacted in: its Item's `sales_uom`, falling back to the
	`stock_uom`.

	The Annex holds the catalogue attributes (category, warranty, manufacturer) while its
	Item (`annex_item`) remains the source of truth for anything transactional — UOM
	included. Single place that hop is made, so the form and the server-side default in
	Amenity.set_missing_uom can't drift apart.
	"""
	if not annex:
		return None

	item = frappe.db.get_value("Annex", annex, "annex_item")
	if not item:
		return None

	sales_uom, stock_uom = frappe.db.get_value("Item", item, ["sales_uom", "stock_uom"])
	return sales_uom or stock_uom
