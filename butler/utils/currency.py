# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def format_currency_in_words(amount, currency):
    """Convert a numeric amount to its written representation in the active locale.

    Butler's own convention rather than ERPNext's `frappe.utils.money_in_words` — see
    docs/quotation_pricing/reference.md for the comparison. Same underlying primitive
    (`frappe.utils.data.in_words`), but: reads the Currency's `currency_name` (e.g.
    "Saudi Riyal") instead of embedding the raw currency code; states the number before
    the currency name and appends "only." (cheque-writing convention); always assumes a
    2-decimal fraction (no lakh/crore numbering-system fallback).
    """
    from decimal import Decimal

    from frappe.utils.data import in_words

    currency_doc = frappe.db.get_value(
        "Currency", currency, ["currency_name", "fraction"], as_dict=True, cache=True
    ) or frappe._dict(currency_name=currency, fraction="")

    currency_name = currency_doc.currency_name or currency
    fraction_name = currency_doc.fraction or ""

    amount = Decimal(str(amount)).quantize(Decimal('0.01'))
    integer_part, fractional_part = str(amount).split('.')

    # in_words respects frappe.local.lang so returns Arabic when locale is Arabic
    integer_words = in_words(int(integer_part)).title()

    if int(fractional_part) > 0:
        fractional_words = in_words(int(fractional_part)).title()
        return (
            f"{integer_words} {_(currency_name, context='Currency')} "
            f"{_('and')} {fractional_words} {_(fraction_name, context='Currency')} {_('only.')}"
        )

    return f"{integer_words} {_(currency_name, context='Currency')} {_('only.')}"
