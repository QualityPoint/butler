from unittest.mock import patch

import frappe
from frappe.tests import UnitTestCase

from butler.butler.doctype.butler_quotation import butler_quotation as bq


def device_row(**kwargs):
	row = frappe._dict(
		device="Curtain Control",
		amenity="Kitchen",
		is_extra_device=1,
		device_quantity=2,
		device_uom=None,
		qtn_device_price=0,
		qtn_exchange_rate=0,
	)
	row.update(kwargs)
	return row


@patch.object(bq, "get_device_uom_conversion", return_value=("Nos", 1))
@patch.object(bq, "get_device_default_uom", return_value="Nos")
@patch.object(bq, "extra_device_standard", return_value={"rate": 500})
class TestExtraDevicePrice(UnitTestCase):
	"""An extra device is priced at its Device's Standard Rate and governed like any device."""

	def price(self, row, qtn_rate=1):
		deviations = []
		amount = bq.ButlerQuotation.price_device_row(None, row, "Villa", deviations, 1, qtn_rate)
		return amount, deviations

	def test_follows_the_standard_rate(self, *_):
		row = device_row()
		amount, deviations = self.price(row)
		self.assertEqual((row.qtn_device_price, row.device_price, amount), (500, 500, 1000))
		self.assertFalse(row.device_price_list)
		self.assertEqual(deviations, [])

	def test_in_the_amenity_currency(self, *_):
		row = device_row()
		self.price(row, qtn_rate=0.2666)  # a USD quotation of a SAR amenity
		self.assertAlmostEqual(row.qtn_device_price, 133.3)
		self.assertAlmostEqual(row.device_price, 500)

	def test_a_changed_price_is_kept_and_reported(self, *_):
		row = device_row(qtn_device_price=450, qtn_exchange_rate=1)
		_amount, deviations = self.price(row)
		self.assertEqual(row.qtn_device_price, 450)
		self.assertEqual(deviations, [(row, 500)])

	def test_governed_by_butler_settings(self, *_):
		row = device_row(qtn_device_price=450)
		with patch.object(bq, "apply_governance_action") as governed:
			bq.ButlerQuotation.enforce_device_price(None, [(row, 500)])
		governed.assert_called_once()
		self.assertIn("Curtain Control", governed.call_args.kwargs["message"])
