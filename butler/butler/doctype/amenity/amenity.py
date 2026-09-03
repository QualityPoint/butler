# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from butler.butler.doctype.annex_price.annex_price import upsert_annex_price


class Amenity(Document):
    def validate(self):
        self.calculate_totals()

    def calculate_totals(self):
        # Authoritative recompute, mirroring erpnext.controllers.taxes_and_totals —
        # not just trusting whatever the client sent.
        total_qty = 0.0
        total = 0.0

        for row in self.annexes:
            row.amount = flt(flt(row.qty) * flt(row.rate), row.precision("amount"))
            total_qty += flt(row.qty)
            total += flt(row.amount)

        self.total_qty = total_qty
        self.total = flt(total, self.precision("total"))

    def before_save(self):
        self.remove_stale_annex_prices()

        # Keep each annex row's standard Annex Price in sync: create it the first
        # time, update it if uom/rate/currency changed, or skip it untouched.
        for row in self.annexes:
            if not (row.annex and row.uom and row.rate):
                continue

            upsert_annex_price(
                annex=row.annex,
                amenity=self.name,
                uom=row.uom,
                rate=row.rate,
                currency=self.currency,
            )

    def remove_stale_annex_prices(self):
        # Any annex dropped from this row since the last save no longer has
        # meaningful pricing here — remove its Annex Price(s), standard and any
        # Facility Type overrides alike, so they don't linger as orphaned data.
        previous = self.get_latest()
        if not previous:
            return

        current_annexes = {row.annex for row in self.annexes if row.annex}
        removed_annexes = {row.annex for row in previous.annexes if row.annex} - current_annexes

        for annex in removed_annexes:
            frappe.db.delete("Annex Price", {"annex": annex, "amenity": self.name})
