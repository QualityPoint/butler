import frappe
from frappe.tests import UnitTestCase

from butler.www.book_appointment import index as page


class TestBookAppointmentGuards(UnitTestCase):
	def test_booking_accepts_post_only(self):
		self.assertEqual(frappe.allowed_http_methods_for_whitelisted_func[page.create_appointment], ["POST"])

	def test_bad_timezone_or_date_is_a_message_not_a_crash(self):
		with self.assertRaises(frappe.ValidationError):
			page.get_appointment_slots("2026-11-22", "Mars/Base")
		with self.assertRaises(frappe.ValidationError):
			page.get_appointment_slots("22/11/2026", "Asia/Riyadh")
		with self.assertRaises(frappe.ValidationError):
			page.create_appointment("2026-11-22", "2 pm", "Asia/Riyadh", "{}")

	def test_contact_must_be_an_object(self):
		self.assertEqual(page.parse_contact('{"name": "Sara"}'), {"name": "Sara"})
		for bad in ("not json", "[]", "42", None):
			with self.assertRaises(frappe.ValidationError):
				page.parse_contact(bad)


class TestSlotCapacity(UnitTestCase):
	"""A slot stays offered until every agent has an Open booking in it (ERPNext's rule)."""

	def slots(self, bookings_at_one_pm):
		from datetime import datetime, timedelta
		from unittest.mock import patch

		settings = frappe._dict(
			holiday_list="Test Holidays",
			appointment_duration=60,
			number_of_agents=4,
			availability_of_slots=[
				frappe._dict(day_of_week="Sunday", from_time=timedelta(hours=13), to_time=timedelta(hours=15))
			],
		)
		docs = {"Appointment Booking Settings": settings, "Holiday List": frappe._dict(holidays=[])}
		get_doc = frappe.get_doc
		booked = [datetime(2026, 11, 29, 13, 0)] * bookings_at_one_pm
		with (
			patch.object(
				page.frappe,
				"get_doc",
				side_effect=lambda doctype, *args: docs.get(doctype) or get_doc(doctype, *args),
			),
			patch.object(page, "get_booked_slot_times_for", return_value=booked),
			patch.object(page, "is_bookable", return_value=True),
		):
			return {
				s["time"].strftime("%H:%M"): s["availability"]
				for s in page.get_appointment_slots("2026-11-29", "Asia/Riyadh")
			}

	def test_open_until_all_agents_are_booked(self):
		self.assertEqual(self.slots(3), {"13:00": True, "14:00": True})
		self.assertEqual(self.slots(4), {"13:00": False, "14:00": True})
