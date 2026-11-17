"""The appointment a verification link names, as the verify page shows it.

ERPNext decides whether the link verifies (`erpnext.www.book_appointment.verify`); this
only reads the slot back for display, in the site's timezone and the visitor's language.
"""

import frappe
from frappe.utils import get_datetime
from frappe.utils.data import sha256_hash

from butler.appointment_booking.display import describe_slot


def slot_for_link(key: str | None) -> dict | None:
	if not key:
		return None
	scheduled_time = frappe.db.get_value(
		"Appointment", {"verification_token": sha256_hash(key)}, "scheduled_time"
	)
	if not scheduled_time:
		return None
	return describe_slot(get_datetime(scheduled_time))
