# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, fmt_money


class ButlerQuotation(Document):
    def before_validate(self):
        self.consolidate_amenities()

    def validate(self):
        self.calculate_totals()

    def consolidate_amenities(self):
        """Merge duplicate amenity lines that share the same (amenity, floor_type),
        summing their qty. Runs server-side so every entry point — the Facility Builder
        (which just sends one row per placement) and manual form edits — stays consistent.

        Skipped when Butler Settings → "Disable Amenity Consolidation" is on.
        """
        if frappe.db.get_single_value("Butler Settings", "disable_amenity_consolidation"):
            return

        merged = {}  # (amenity, floor_type) -> kept row
        kept = []
        for row in self.amenities:
            key = (row.amenity, row.floor_type)
            if key in merged:
                merged[key].qty = cint(merged[key].qty) + cint(row.qty)
            else:
                merged[key] = row
                kept.append(row)

        if len(kept) != len(self.amenities):
            for idx, row in enumerate(kept, start=1):
                row.idx = idx
            self.amenities = kept

    def before_submit(self):
        self.validate_dependencies()

    def validate_dependencies(self):
        """Every dependant amenity's required `depends_on` amenities must also be on the
        quotation. Optimised to a single query: gather all dependency links for the
        dependant amenities at once, then check them against the present amenities in memory.
        """
        present = {r.amenity for r in self.amenities if r.amenity}
        dependants = {r.amenity for r in self.amenities if r.is_dependant_amenity and r.amenity}
        if not dependants:
            return

        deps = frappe.get_all(
            "Amenity Depends On",
            filters={
                "parenttype": "Amenity",
                "parentfield": "depends_on",
                "parent": ["in", list(dependants)],
            },
            fields=["parent", "amenity"],
        )

        missing = {}  # amenity -> set of its missing dependencies
        for d in deps:
            if d.amenity and d.amenity not in present:
                missing.setdefault(d.parent, set()).add(d.amenity)

        if missing:
            lines = "".join(
                "<li>{0} &rarr; {1}</li>".format(frappe.bold(a), ", ".join(sorted(m)))
                for a, m in missing.items()
            )
            frappe.throw(
                _("These amenities require dependencies that aren't in the quotation:")
                + f"<ul>{lines}</ul>",
                title=_("Missing dependencies"),
            )

    def calculate_totals(self):
        """Roll the amenity lines up into the header totals.

        Centralised here so it applies whether the doc is created from the
        Facility Builder or edited on the form.
        """
        # --- per-line price (server-authoritative) + amount + amenity count ---
        facility_type = self.facility_type or (
            self.facility and frappe.db.get_value("Facility", self.facility, "facility_type")
        )
        # floor_count = number of DISTINCT floor types used across the amenity lines
        self.floor_count = len({r.floor_type for r in self.amenities if r.floor_type})

        amenity_count = 0
        items_total = 0.0
        deviations = []
        for row in self.amenities:
            row.qty = cint(row.qty)
            info = get_amenity_pricing(row.amenity, facility_type)
            resolved = flt(info["amenity_price"])
            row.amenity_price = resolved  # the reference standard price
            if not row.rate:
                row.rate = resolved  # default to standard; the user may override it
            if abs(flt(row.rate) - resolved) > 0.005:
                deviations.append(row)  # standard price not maintained
            # floor-dependent amenities are priced across every distinct floor
            floors = self.floor_count if (info["depends_on_floor_count"] and self.floor_count) else 1
            row.amount = flt(floors) * flt(row.rate) * flt(row.qty)
            amenity_count += row.qty
            items_total += flt(row.amount)
        self.amenity_count = amenity_count
        self.enforce_standard_price(deviations)

        # --- bundle price (the bundle is sold at its own flat price) ---
        if self.order_type == "Bundle" and self.bundle_type:
            self.bundle_price = flt(
                frappe.db.get_value("Butler Bundle", self.bundle_type, "bundle_price")
            )
        else:
            self.bundle_price = 0

        # --- total: bundle price for a Bundle, else the summed amenities ---
        self.total = self.bundle_price if self.order_type == "Bundle" else items_total

        # --- additional discount → net total ---
        if self.apply_discount_by == "Percentage":
            self.discount_amount = flt(self.total) * flt(self.additional_discount_percentage) / 100.0
        elif self.apply_discount_by == "Amount":
            self.additional_discount_percentage = (
                flt(self.discount_amount) / flt(self.total) * 100.0 if self.total else 0
            )
        else:
            self.additional_discount_percentage = 0
            self.discount_amount = 0

        self.net_total = flt(self.total) - flt(self.discount_amount)

    def enforce_standard_price(self, deviations):
        """Govern lines whose rate deviates from the amenity's standard price, per
        Butler Settings → Action if amenity standard price is not maintained:
          Ignore → allow · Warn → msgprint · Stop → throw (unless the user has the
          configured override Role, in which case warn but allow).
        """
        if not deviations:
            return
        action = frappe.db.get_single_value("Butler Settings", "maintain_standard_price_action") or "Stop"
        if action == "Ignore":
            return

        lines = "".join(
            "<li>{0} — {1} (standard {2})</li>".format(
                frappe.bold(r.amenity), fmt_money(r.rate), fmt_money(r.amenity_price)
            )
            for r in deviations
        )
        msg = _("These amenities don't keep the standard price:") + f"<ul>{lines}</ul>"

        if action == "Warn":
            frappe.msgprint(msg, title=_("Standard price not maintained"), indicator="orange")
            return

        # Stop: block, unless the current user holds the override role (then warn + allow)
        override_role = frappe.db.get_single_value("Butler Settings", "role_to_override_stop_action")
        if override_role and override_role in frappe.get_roles():
            frappe.msgprint(
                msg + "<br>" + _("Overridden by your role: {0}").format(frappe.bold(override_role)),
                title=_("Standard price overridden"),
                indicator="orange",
            )
            return
        frappe.throw(msg, title=_("Standard price not maintained"))


@frappe.whitelist()
def get_amenity_pricing(amenity, facility_type=None):
    """Single source of truth for an amenity's standard price (used by the server
    calculation AND the client form). Default is the Amenity's standard_price; if it has
    a changeable price and a facility_type_prices row matches, that row's price wins.
    """
    if not amenity:
        return {"amenity_price": 0.0, "depends_on_floor_count": 0}
    am = frappe.get_cached_doc("Amenity", amenity)
    price = flt(am.standard_price)
    if am.has_changeable_price and facility_type:
        for r in am.facility_type_prices or []:
            if r.facility_type == facility_type:
                price = flt(r.amenity_price)
                break
    return {"amenity_price": price, "depends_on_floor_count": cint(am.depends_on_floor_count)}
