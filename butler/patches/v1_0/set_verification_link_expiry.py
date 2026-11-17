import frappe
from frappe.utils import cint

SETTINGS = "Appointment Booking Settings"


def execute():
	"""Store ERPNext's default 30-minute link expiry where none is set.

	A site saved before the field existed has no value, which ERPNext reads as 0 minutes, so
	every verification link it emails has expired by the time it is opened.
	"""
	if not cint(frappe.db.get_single_value(SETTINGS, "verification_link_expiry_duration")):
		frappe.db.set_single_value(SETTINGS, "verification_link_expiry_duration", 30)
