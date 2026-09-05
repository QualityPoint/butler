# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model import display_fieldtypes, table_fields
from frappe.model.document import Document
from frappe.utils import cint, flt
from butler.butler.doctype.annex.annex import get_annex_default_uom
from butler.butler.doctype.annex_price.annex_price import upsert_annex_price

# A `depends_on` of the plain "only shown while this checkbox is on" shape — the one form
# that can be resolved server-side without evaluating arbitrary JavaScript.
SIMPLE_DEPENDS_ON = re.compile(r"^eval:\s*doc\.(\w+)\s*;?\s*$")


class Amenity(Document):
    def validate(self):
        self.validate_light_systems()
        self.calculate_totals()

    def validate_light_systems(self):
        """The light systems have to describe a coherent split of the amenity's lines:
        each Light System appears once, every row consumes at least one line, and the
        rows together can't claim more lines than the amenity has.

        A negative `used_lines` is already refused by the field's non_negative flag, and
        zero is not — `reqd` accepts 0 on an Int — hence the explicit floor here.
        """
        seen = set()
        used_lines = 0

        for row in self.light_systems:
            # an empty system_name is left to the mandatory check to report
            if row.system_name and row.system_name in seen:
                frappe.throw(
                    _("Row #{0}: {1} is already in the Light Systems table.").format(
                        row.idx, frappe.bold(row.system_name)
                    ),
                    title=_("Duplicate Light System"),
                )
            seen.add(row.system_name)

            if cint(row.used_lines) < 1:
                frappe.throw(
                    _("Row #{0}: Used Lines must be at least 1.").format(row.idx),
                    title=_("Invalid Used Lines"),
                )

            used_lines += cint(row.used_lines)

        if used_lines > cint(self.lines):
            frappe.throw(
                _("The light systems use {0} lines in total, but this amenity only has {1}.").format(
                    frappe.bold(used_lines), frappe.bold(cint(self.lines))
                ),
                title=_("Too many lines used"),
            )

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
        self.clear_dependent_fields()
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

    def clear_dependent_fields(self):
        """Blank out whatever the form is currently hiding: when a field is shown only
        while some checkbox is ticked and that checkbox is off, its value can't be seen
        or edited, so keeping it would leave stale data behind — a Floor Extra Price
        surviving after Depends On Floor Count was unticked, or Primary Amenities rows
        outliving Is Dependant Amenity.

        Read off the doctype's own `depends_on` metadata instead of a hardcoded list, so
        a dependent field added later is covered the moment it exists. Only the plain
        `eval:doc.<fieldname>` form is resolved; anything more involved is left untouched
        rather than guessed at.
        """
        for df in self.meta.fields:
            # layout-only fieldtypes hold nothing to clear (note: frappe's no_value_fields
            # is the wrong set here — it counts Table as valueless, and tables are exactly
            # what we need to empty)
            if df.fieldtype in display_fieldtypes:
                continue

            controller = SIMPLE_DEPENDS_ON.match(df.depends_on or "")
            if not controller or self.get(controller.group(1)):
                continue

            self.set(df.fieldname, [] if df.fieldtype in table_fields else None)

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
