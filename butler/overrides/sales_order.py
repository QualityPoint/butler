# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

import frappe


def update_butler_quotation_status(doc, method=None):
    """When a Sales Order is submitted or cancelled, recompute the status of any
    Butler Quotation its items were raised from (Open / Partially Ordered /
    Ordered) — the Butler equivalent of ERPNext's Sales Order.update_prevdoc_status.
    """
    quotations = {row.butler_quotation for row in doc.items if row.get("butler_quotation")}
    for name in quotations:
        frappe.get_doc("Butler Quotation", name).set_status(update=True)
