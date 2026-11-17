from datetime import datetime
from unittest.mock import patch

import frappe
from frappe.tests import UnitTestCase

from butler.appointment_booking import notice

SLOT = datetime(2026, 11, 17, 13, 0)


@patch.object(notice, "minimum_notice_hours", return_value=2)
class TestMinimumNotice(UnitTestCase):
	def test_open_until_exactly_the_notice_before(self, _hours):
		self.assertTrue(notice.is_bookable(SLOT, now=datetime(2026, 11, 17, 10, 0)))
		self.assertTrue(notice.is_bookable(SLOT, now=datetime(2026, 11, 17, 11, 0)))

	def test_closed_inside_the_notice(self, _hours):
		self.assertFalse(notice.is_bookable(SLOT, now=datetime(2026, 11, 17, 11, 0, 1)))
		self.assertFalse(notice.is_bookable(SLOT, now=datetime(2026, 11, 17, 12, 30)))
		self.assertFalse(notice.is_bookable(SLOT, now=datetime(2026, 11, 17, 14, 0)))

	def test_booking_inside_the_notice_is_refused(self, _hours):
		with patch.object(notice, "now_datetime", return_value=datetime(2026, 11, 17, 12, 30)):
			with self.assertRaises(frappe.ValidationError):
				notice.validate_notice(SLOT)
