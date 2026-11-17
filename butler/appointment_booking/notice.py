"""Minimum notice for bookings made on the public appointment page.

A slot is open while it starts at least `minimum_notice_hours` (Appointment Booking Settings)
after now, in the site's timezone. Appointments created in the desk are not limited.
"""

from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

SETTINGS = "Appointment Booking Settings"


def minimum_notice_hours() -> int:
	return cint(frappe.db.get_single_value(SETTINGS, "minimum_notice_hours"))


def is_bookable(slot_start: datetime, now: datetime | None = None) -> bool:
	"""Whether a slot starting at `slot_start` (site time) may still be booked: exactly the
	minimum notice before it still counts."""
	now = now or now_datetime()
	return slot_start - now >= timedelta(hours=minimum_notice_hours())


def validate_notice(slot_start: datetime) -> None:
	if not is_bookable(slot_start):
		frappe.throw(
			_("Appointments must be booked at least {0} hours in advance.").format(minimum_notice_hours()),
			title=_("Too Late to Book"),
		)
