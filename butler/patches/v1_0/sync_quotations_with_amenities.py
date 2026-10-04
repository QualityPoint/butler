import frappe

from butler.butler.doctype.butler_quotation.butler_quotation import sync_with_amenities


def execute():
	"""Bring draft quotations in line with their Amenities' current annex lists, once.

	A non-customised amenity follows its Amenity on every save. A draft not saved since its
	Amenities changed (annexes added, e.g. the light lines, or removed, which also deletes
	their Annex Prices) would otherwise jump — or, with a deleted price, fail — the next
	time anyone saves it. This saves each one now, with a timeline note of the old and new
	total. Runs after convert_legacy_quotations, whose drafts already match. A draft that
	fails (a customised amenity still holding a removed annex) is rolled back alone and
	logged. See docs/quotation_pricing/annexes.md.
	"""
	drafts = frappe.get_all("Butler Quotation", filters={"docstatus": 0}, pluck="name", order_by="creation asc")
	frappe.flags.mute_messages = True
	try:
		for name in drafts:
			frappe.db.savepoint("sync_with_amenities")
			try:
				result = sync_with_amenities(name)
			except Exception:
				frappe.db.rollback(save_point="sync_with_amenities")
				frappe.log_error(title=f"Quotation not synced with its Amenities: {name}")
				print(f"{name}: NOT synced, see Error Log")
				continue
			if result:
				print(
					f"{name}: {result['amenities']} amenities synced, "
					f"{result['old_total']:,.2f} -> {result['new_total']:,.2f}"
				)
	finally:
		frappe.flags.mute_messages = False
