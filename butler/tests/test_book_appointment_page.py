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
