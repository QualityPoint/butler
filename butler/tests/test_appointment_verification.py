from datetime import datetime
from unittest.mock import patch

import frappe
from frappe.tests import UnitTestCase

from butler.appointment_booking import verification
from butler.www.book_appointment.verify import index as verify_page


class TestVerificationSlot(UnitTestCase):
	def setUp(self):
		self.lang = frappe.local.lang
		frappe.local.lang = "en"

	def tearDown(self):
		frappe.local.lang = self.lang

	@patch.object(verification, "get_system_timezone", return_value="Asia/Riyadh")
	def test_describes_the_slot(self, _tz):
		self.assertEqual(
			verification.describe_slot(datetime(2026, 11, 22, 14, 0), 60),
			{
				"day": "Sunday",
				"date": "22 November 2026",
				"time": "2:00 PM – 3:00 PM",  # noqa: RUF001
				"timezone": "Riyadh time",
			},
		)

	def test_no_slot_without_a_known_link(self):
		self.assertIsNone(verification.slot_for_link(None))
		self.assertIsNone(verification.slot_for_link("not-a-real-key"))


class TestVerifyPage(UnitTestCase):
	def render(self, success):
		def erpnext(context):
			context.success = success
			return context

		context = frappe._dict()
		with (
			patch.object(verify_page, "verify_with_erpnext", side_effect=erpnext) as decided,
			patch.object(verify_page, "slot_for_link", return_value={"day": "Sunday"}),
		):
			verify_page.get_context(context)
		decided.assert_called_once_with(context)
		return context

	def test_erpnext_decides_and_butler_adds_the_slot(self):
		context = self.render(success=True)
		self.assertEqual(context.slot, {"day": "Sunday"})
		self.assertTrue(context.full_width)

	def test_no_slot_when_not_confirmed(self):
		self.assertIsNone(self.render(success=False).slot)
