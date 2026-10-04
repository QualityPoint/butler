import frappe

from butler.butler.doctype.butler_quotation.butler_quotation import (
	convert_legacy_quotation,
	is_legacy_quotation,
)


def execute():
	"""Convert draft quotations made before the current row model, once.

	They hold one consolidated row per (amenity, floor), with no placement ids and no annex
	rows, so the line editor and the Facility Builder can't work with them. Each is rebuilt
	from its Facility drawing: one row per drawn room, annexes from each Amenity, priced at
	today's standards, with its old total and rows kept in a timeline comment.
	See docs/legacy_quotations.md.

	Runs after add_light_system_devices, so the Light Systems already have the devices
	the quotation's Devices table is counted from. A converted quotation no longer matches,
	so running this again changes nothing. One quotation that fails (an amenity in its
	drawing that no longer exists, say) is rolled back alone and logged; the rest go ahead.
	"""
	candidates = frappe.get_all(
		"Butler Quotation",
		filters={"docstatus": 0, "geometry": ["is", "set"]},
		pluck="name",
		order_by="creation asc",
	)
	legacy = [name for name in candidates if is_legacy_quotation(name)]
	if not legacy:
		return

	frappe.flags.mute_messages = True
	try:
		for name in legacy:
			frappe.db.savepoint("convert_legacy_quotation")
			try:
				result = convert_legacy_quotation(name)
			except Exception:
				frappe.db.rollback(save_point="convert_legacy_quotation")
				frappe.log_error(title=f"Legacy quotation not converted: {name}")
				print(f"{name}: NOT converted, see Error Log")
				continue
			devices = ", ".join(f"{device} x {count}" for device, count in result["devices"]) or "none"
			print(
				f"{name}: {result['old_total']:,.2f} -> {result['new_total']:,.2f}, "
				f"{result['rooms']} rooms, {result['annex_rows']} annex rows, devices {devices}"
			)
	finally:
		frappe.flags.mute_messages = False
