"""How an appointment reads to the customer on the verify and thanks pages.

Dates and times are in the site's timezone (System Settings) and the visitor's language.
"""

from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.utils import cint, format_date, format_time, get_datetime
from frappe.utils.data import get_system_timezone


def describe_slot(start: datetime, minutes: int | None = None) -> dict:
	if minutes is None:
		minutes = appointment_duration()
	end = start + timedelta(minutes=minutes)
	city = get_system_timezone().rsplit("/", 1)[-1].replace("_", " ")
	return {
		"day": format_date(start, "EEEE"),
		"date": format_date(start, "d MMMM y"),
		"time": f"{format_time(start, 'h:mm a')} – {format_time(end, 'h:mm a')}",  # noqa: RUF001
		"timezone": _("{0} time").format(_(city)),
	}


def booking_summary(appointment) -> dict:
	"""What the thanks page shows: only what the customer entered or was just given."""
	return {
		"reference": appointment.name,
		"customer_name": appointment.customer_name,
		"slot": describe_slot(get_datetime(appointment.scheduled_time)),
		"booked_on": _("{0}, {1}").format(
			format_date(appointment.creation, "d MMMM y"), format_time(appointment.creation, "h:mm a")
		),
	}


def appointment_duration() -> int:
	return cint(frappe.db.get_single_value("Appointment Booking Settings", "appointment_duration"))
