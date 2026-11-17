import datetime

import frappe
from erpnext.setup.doctype.holiday_list.holiday_list import is_holiday
from erpnext.www.book_appointment.index import (
	convert_to_guest_timezone,
	convert_to_system_timezone,
	get_booked_slot_times_for,
	is_slot_available,
	parse_datetime,
	validate_timezone,
)
from frappe import _
from frappe.rate_limiter import rate_limit

from butler.appointment_booking.display import booking_summary
from butler.appointment_booking.notice import is_bookable, validate_notice

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

no_cache = 1


def get_context(context):
	is_enabled = frappe.db.get_single_value("Appointment Booking Settings", "enable_scheduling")
	if is_enabled:
		return context
	else:
		frappe.redirect_to_message(
			_("Appointment Scheduling Disabled"),
			_("Appointment Scheduling has been disabled for this site"),
			http_status_code=302,
			indicator_color="red",
		)
		raise frappe.Redirect


@frappe.whitelist(allow_guest=True)
def get_appointment_settings():
	settings = frappe.get_cached_value(
		"Appointment Booking Settings",
		None,
		["advance_booking_days", "appointment_duration", "success_redirect_url"],
		as_dict=True,
	)
	return settings


@frappe.whitelist(allow_guest=True)
def get_timezones():
	import pytz

	return pytz.all_timezones


# The same limits as ERPNext's own booking page (erpnext/www/book_appointment/index.py).
SLOT_REQUESTS_PER_MINUTE = 60
BOOKINGS_PER_FIVE_MINUTES = 5


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=SLOT_REQUESTS_PER_MINUTE, seconds=60)
def get_appointment_slots(date, timezone):
	# Convert query to local timezones
	validate_timezone(timezone)
	query_start_time = parse_datetime(date, "00:00:00")
	date_required = query_start_time.date()
	query_end_time = parse_datetime(date, "23:59:59")
	query_start_time = convert_to_system_timezone(timezone, query_start_time)
	query_end_time = convert_to_system_timezone(timezone, query_end_time)

	# Database queries
	settings = frappe.get_doc("Appointment Booking Settings")
	timeslots = get_available_slots_between(query_start_time, query_end_time, settings)
	# the day's Open bookings, once: a slot stays offered until every agent is booked
	booked_times = get_booked_slot_times_for(timeslots, settings.appointment_duration)

	# Filter and convert timeslots
	converted_timeslots = []
	for timeslot in timeslots:
		converted_timeslot = convert_to_guest_timezone(timezone, timeslot)
		# a holiday is a business date: the slot's date in the site's timezone, as the server checks it
		if is_holiday(settings.holiday_list, timeslot.date()):
			converted_timeslots.append(dict(time=converted_timeslot, availability=False))
			continue
		# Check availability
		if is_slot_available(timeslot, booked_times, settings) and is_bookable(timeslot):
			converted_timeslots.append(dict(time=converted_timeslot, availability=True))
		else:
			converted_timeslots.append(dict(time=converted_timeslot, availability=False))

	converted_timeslots = filter_timeslots(date_required, converted_timeslots)
	return converted_timeslots


def get_available_slots_between(query_start_time, query_end_time, settings):
	records = _get_records(query_start_time, query_end_time, settings)
	timeslots = []
	appointment_duration = datetime.timedelta(minutes=settings.appointment_duration)
	for record in records:
		if record.day_of_week == WEEKDAYS[query_start_time.weekday()]:
			current_time = _deltatime_to_datetime(query_start_time, record.from_time)
			end_time = _deltatime_to_datetime(query_start_time, record.to_time)
		else:
			current_time = _deltatime_to_datetime(query_end_time, record.from_time)
			end_time = _deltatime_to_datetime(query_end_time, record.to_time)
		while current_time + appointment_duration <= end_time:
			timeslots.append(current_time)
			current_time += appointment_duration
	return timeslots


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=BOOKINGS_PER_FIVE_MINUTES, seconds=5 * 60)
def create_appointment(date, time, tz, contact):
	validate_timezone(tz)
	scheduled_time = parse_datetime(date, time)
	# Strip tzinfo from datetime objects since it's handled by the doctype
	scheduled_time = scheduled_time.replace(tzinfo=None)
	scheduled_time = convert_to_system_timezone(tz, scheduled_time)
	scheduled_time = scheduled_time.replace(tzinfo=None)
	validate_notice(scheduled_time)
	contact = parse_contact(contact)

	# Ensure a Lead exists for this email BEFORE inserting the appointment.
	# Appointment.before_insert links a Lead/Customer matching the email as the
	# "party"; with a party set, after_insert auto-confirms the appointment
	# (status "Open" + agent assignment + calendar event) instead of sending a
	# confirmation email -- so booking works without an outgoing Email Account.
	# Reuse an existing Lead to avoid ERPNext's duplicate-email validation.
	if contact.get("email") and not frappe.db.exists("Lead", {"email_id": contact.get("email")}):
		lead = frappe.new_doc("Lead")
		lead.first_name = contact.get("name", None)
		lead.company_name = contact.get("company", None)
		lead.email_id = contact.get("email", None)
		lead.mobile_no = contact.get("number", None)
		lead.insert(ignore_permissions=True)

	# Create a appointment document from form
	appointment = frappe.new_doc("Appointment")
	appointment.scheduled_time = scheduled_time
	appointment.customer_name = contact.get("name", None)
	appointment.customer_phone_number = contact.get("number", None)
	# appointment.customer_skype = contact.get("skype", None)
	appointment.customer_details = contact.get("notes", None)
	appointment.customer_email = contact.get("email", None)
	appointment.status = "Open"
	appointment.insert(ignore_permissions=True)

	# only what the thanks page shows, not the whole record (agent, party, ...)
	return booking_summary(appointment)


# Helper Functions
def filter_timeslots(date, timeslots):
	filtered_timeslots = []
	for timeslot in timeslots:
		if timeslot["time"].date() == date:
			filtered_timeslots.append(timeslot)
	return filtered_timeslots


def parse_contact(contact) -> dict:
	try:
		contact = frappe.parse_json(contact)
	except ValueError:
		contact = None
	if not isinstance(contact, dict):
		frappe.throw(_("Please fill in your contact details."))
	return contact


def _get_records(start_time, end_time, settings):
	records = []
	for record in settings.availability_of_slots:
		if (
			record.day_of_week == WEEKDAYS[start_time.weekday()]
			or record.day_of_week == WEEKDAYS[end_time.weekday()]
		):
			records.append(record)
	return records


def _deltatime_to_datetime(date, deltatime):
	time = (datetime.datetime.min + deltatime).time()
	return datetime.datetime.combine(date.date(), time)


def _datetime_to_deltatime(date_time):
	midnight = datetime.datetime.combine(date_time.date(), datetime.time.min)
	return date_time - midnight
