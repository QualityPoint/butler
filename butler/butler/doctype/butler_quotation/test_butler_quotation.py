# Copyright (c) 2026, QualityPoint and contributors
# See license.txt

import frappe
from frappe.tests import UnitTestCase


class TestButlerQuotation(UnitTestCase):
	def make_quotation(self, **payment_term):
		return frappe.get_doc(
			{
				"doctype": "Butler Quotation",
				"currency": "SAR",
				"conversion_rate": 1,
				"transaction_date": "2026-11-15",
				"grand_total": 1000,
				"base_grand_total": 1000,
				"payment_schedule": [{"due_date": "2026-12-15", **payment_term}],
			}
		)

	def test_payment_schedule_follows_grand_total(self):
		# Borrowed from ERPNext's AccountsController: every helper those methods call
		# must be borrowed too, or saving fails with an AttributeError.
		quotation = self.make_quotation(invoice_portion=100)
		quotation.set_payment_schedule()
		quotation.validate_payment_schedule_amount()

		term = quotation.payment_schedule[0]
		self.assertEqual(term.payment_amount, 1000)
		self.assertEqual(term.outstanding, 1000)
		self.assertEqual(term.base_outstanding, 1000)

	def test_payment_schedule_must_match_grand_total(self):
		quotation = self.make_quotation(payment_amount=600)
		quotation.set_payment_schedule()

		self.assertRaises(frappe.ValidationError, quotation.validate_payment_schedule_amount)
