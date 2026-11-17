"""The appointment a verification link names, as the verify page shows it.

ERPNext decides whether the link verifies (`erpnext.www.book_appointment.verify`); this
only reads the slot back for display, in the site's timezone and the visitor's language.
"""

from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.utils import cint, format_date, format_time, get_datetime
from frappe.utils.data import get_system_timezone, sha256_hash


def slot_for_link(key: str | None) -> dict | None:
	if not key:
		return None
	scheduled_time = frappe.db.get_value(
		"Appointment", {"verification_token": sha256_hash(key)}, "scheduled_time"
	)
	if not scheduled_time:
		return None
	duration = cint(frappe.db.get_single_value("Appointment Booking Settings", "appointment_duration"))
	return describe_slot(get_datetime(scheduled_time), duration)


def describe_slot(start: datetime, minutes: int) -> dict:
	end = start + timedelta(minutes=minutes)
	city = get_system_timezone().rsplit("/", 1)[-1].replace("_", " ")
	return {
		"day": format_date(start, "EEEE"),
		"date": format_date(start, "d MMMM y"),
		"time": f"{format_time(start, 'h:mm a')} – {format_time(end, 'h:mm a')}",  # noqa: RUF001
		"timezone": _("{0} time").format(_(city)),
	}
