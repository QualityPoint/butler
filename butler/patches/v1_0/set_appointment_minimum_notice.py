import frappe

from butler.custom.custom_fields import make_custom_fields


def execute():
	"""Give existing sites the 2-hour minimum notice; a missing Single value would read as 0."""
	make_custom_fields()
	if not frappe.db.sql(
		"select 1 from `tabSingles` where doctype='Appointment Booking Settings' and field='minimum_notice_hours'"
	):
		frappe.db.set_single_value("Appointment Booking Settings", "minimum_notice_hours", 2)
