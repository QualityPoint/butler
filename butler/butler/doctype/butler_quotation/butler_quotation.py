# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

import erpnext
import frappe
from erpnext.setup.utils import get_exchange_rate
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import (
    add_days,
    add_months,
    cint,
    flt,
    fmt_money,
    getdate,
    nowdate,
    round_based_on_smallest_currency_fraction,
)


class ButlerQuotation(Document):
    def before_validate(self):
        self.set_default_company()
        self.set_default_valid_till()
        self.set_party_from_facility()
        self.clear_additional_amenities()
        self.consolidate_amenities()

    def set_party_from_facility(self):
        """Default quotation_to / party_name from the Facility's linked party when the
        quotation doesn't already carry one.

        A Facility links to at most one Customer and one Lead (enforced on Facility);
        when both exist the **Customer wins** (a Customer is a firmer relationship than
        a Lead). Resolved server-side — before validate_quotation_to and the mandatory
        gate — so the Facility Builder's programmatic insert (which never fills the
        party) gets a valid quotation_to + party_name, and the form benefits too.

        An explicit party already on the doc is respected (never overwritten). If the
        Facility links to neither, we throw a clear message instead of letting the
        generic "quotation_to is mandatory" error surface.
        """
        if self.party_name:          # respect an explicit choice (form, or a re-save)
            return
        if not self.facility:        # the facility reqd-check will catch an empty facility
            return

        quotation_to, party_name = get_facility_party(self.facility)
        if not party_name:
            frappe.throw(
                _("Link a Customer or a Lead to Facility {0} before creating a quotation.")
                .format(frappe.bold(self.facility)),
                title=_("Facility has no party"),
            )
        self.quotation_to = quotation_to
        self.party_name = party_name
        # the party was just resolved (no form ran) → also default its address + contact,
        # the way the form's party_name trigger does, so this quotation matches a form one
        self.apply_party_details()

    def apply_party_details(self):
        """Default the billing Address + Contact (and their display fields) from the
        current party — the server-side mirror of the form's `party_name` →
        get_party_details flow (same get_default_address / get_default_contact source).

        Only fills blanks, so it never overrides a value already on the doc. Called from
        set_party_from_facility, i.e. only when the party was auto-resolved (Facility
        Builder / programmatic insert) — on the form the client handles address/contact,
        and a field the user deliberately cleared stays cleared.
        """
        if not (self.quotation_to and self.party_name):
            return
        for field, value in get_party_details(self.party_name, self.quotation_to).items():
            if not self.get(field):
                self.set(field, value)

    def clear_additional_amenities(self):
        """Safeguard: the additional_amenity flag only applies to a Bundle order, so
        clear it on every line for any other order type."""
        if self.order_type == "Bundle":
            return
        for row in self.amenities:
            row.additional_amenity = 0

    def set_default_valid_till(self):
        """Default valid_till like ERPNext's Quotation: transaction_date plus
        Butler Settings -> Default Quotation Validity Days, falling back to one
        month. Done server-side (not just on the form) so the Facility Builder's
        programmatic insert gets a valid_till too.
        """
        if self.valid_till or not self.transaction_date:
            return

        days = cint(frappe.db.get_single_value(
            "Butler Settings", "default_valid_till"))
        self.valid_till = (
            add_days(self.transaction_date, days)
            if days
            else add_months(self.transaction_date, 1)
        )

    def set_default_company(self):
        """Resolve Company the way ERPNext does when it isn't supplied (e.g. the
        Facility Builder creates quotations programmatically via frappe.client.insert,
        which never fills it). Order:
          1. user/session default company  (erpnext.get_default_company step 1)
          2. Global Defaults -> Default Company  (erpnext.get_default_company step 2)
          3. the only company the user is permitted to see
        If it's still ambiguous (multiple permitted companies and no default), leave it
        empty so the reqd field makes the user pick one they're allowed to use.
        """
        if self.company:
            return

        self.company = erpnext.get_default_company()
        if self.company:
            return

        permitted = frappe.get_list("Company", pluck="name", limit=2)
        if len(permitted) == 1:
            self.company = permitted[0]

    def validate(self):
        self.validate_quotation_to()
        self.set_customer_name()
        self.set_facility_address()
        self.validate_taxes()
        self.set_bundle_breakdown()
        self.calculate_totals()
        # governance runs on save only (calculate_totals stays throw-free for live recalc)
        self.enforce_standard_price(
            getattr(self, "_price_deviations", []),
            getattr(self, "_bundle_price_breach", None),
        )
        self.validate_bundle_amenities(enforce=False)  # warn while editing
        self.validate_exchange_rates(enforce=False)  # warn while editing
        self.validate_valid_till()

    def validate_exchange_rates(self, enforce):
        """Every currency used on the quotation needs a rate to the company currency. A
        row left at 0 means no Currency Exchange record was found and none was entered,
        so prices in that currency can't be converted. Warn while editing; block at
        submit — mirroring ERPNext's validate_conversion_rate."""
        missing = [r.currency for r in self.exchange_rates if flt(r.conversion_rate) <= 0]
        if not missing:
            return
        company_currency = (
            erpnext.get_company_currency(self.company) if self.company else _("company currency"))
        lines = "".join(
            "<li>{0} &rarr; {1}</li>".format(frappe.bold(c), company_currency)
            for c in sorted(missing)
        )
        msg = _("These currencies have no exchange rate to the company currency — enter it "
                "in the Currency Exchange Rates table, or create a Currency Exchange "
                "record:") + f"<ul>{lines}</ul>"
        title = _("Missing exchange rate")
        if enforce:
            frappe.throw(msg, title=title)
        frappe.msgprint(msg, title=title, indicator="orange")

    @frappe.whitelist()
    def recalculate(self):
        """Live (no-save) recompute of amounts and totals for the form: refreshes the
        bundle breakup then runs the same calculate_totals, without the standard-price /
        bundle governance throws (those apply on save in validate). Called from the form
        on any pricing input change."""
        self.set_bundle_breakdown()
        self.calculate_totals()

    def validate_taxes(self):
        """Per-row sanity of the Sales Taxes and Charges rows (charge_type ↔ row_id),
        reusing ERPNext's validator — same check its calculate_taxes_and_totals runs.
        Inclusive taxes aren't modelled by _apply_taxes, so reject them rather than
        compute a silently wrong total."""
        from erpnext.controllers.accounts_controller import validate_taxes_and_charges
        for tax in self.get("taxes") or []:
            validate_taxes_and_charges(tax)
            if tax.included_in_print_rate:
                frappe.throw(
                    _("Row {0}: inclusive taxes (Included in Print Rate) aren't supported "
                      "on a Butler Quotation.").format(tax.idx),
                    title=_("Unsupported tax"),
                )

    def set_bundle_breakdown(self):
        """Fill the read-only Bundle Items breakup from the selected Bundle's
        per-category amenity allowance (single source of truth in
        butler_bundle.get_bundle_breakdown). Server-authoritative so it's correct
        whatever the entry point — form, Facility Builder, or a programmatic insert
        — and cleared for non-bundle orders so a stale breakup never lingers.
        """
        self.bundle_items = []
        if self.order_type != "Bundle" or not self.bundle_type:
            return

        from butler.butler.doctype.butler_bundle.butler_bundle import get_bundle_breakdown

        for row in get_bundle_breakdown(self.bundle_type):
            self.append("bundle_items", {
                "amenity_category": row["amenity_category"],
                "amenity_count": row["amenity_count"],
            })

    def set_facility_address(self):
        """Render the Facility's default linked Address into facility_address.
        Facility links to Address via Dynamic Link (same pattern as Customer /
        Company), so this works just like customer_address_display. Done
        server-side so the Facility Builder's programmatic inserts get it too."""
        self.facility_address = get_facility_address_display(self.facility)

    def validate_quotation_to(self):
        """Ensure quotation_to is one of the allowed options. The field's options are
        static (Customer, Lead, Prospect) so this is just a sanity check."""
        if self.quotation_to not in ("Customer", "Lead"):
            frappe.throw(_("quotation_to must be Customer or Lead"))

    def set_customer_name(self):
        """Resolve the party's display name into customer_name, mirroring ERPNext's
        Quotation.set_customer_name. Runs server-side so it is correct regardless of
        the entry point (form, Facility Builder, or a programmatic insert)."""
        self.customer_name = get_party_name(self.quotation_to, self.party_name)

    def on_submit(self):
        self.set_status(update=True)

    def on_cancel(self):
        self.set_status(update=True)

    # --- Sales Order status tracking (mirrors ERPNext's Quotation) ---------

    def set_status(self, update=False):
        """Recompute status like ERPNext's Quotation: Draft -> Open on submit,
        then Partially Ordered / Ordered as Sales Orders are raised against it.
        A manually set Lost/Expired is preserved while nothing is ordered.
        """
        if self.docstatus == 2:
            status = "Cancelled"
        elif self.docstatus == 1:
            ordered_status = self.get_ordered_status()
            if ordered_status != "Open":
                status = ordered_status
            elif self.status in ("Lost", "Expired"):
                status = self.status
            else:
                status = "Open"
        else:
            status = "Draft"

        if update:
            self.db_set("status", status, update_modified=False)
        else:
            self.status = status

    def get_ordered_items(self):
        """qty ordered per Butler Quotation Item row, summed across submitted
        Sales Order Items that link back via the butler_quotation_item field."""
        ordered = frappe._dict()
        rows = frappe.get_all(
            "Sales Order Item",
            filters={"butler_quotation": self.name, "docstatus": 1},
            fields=["butler_quotation_item", "qty"],
        )
        for row in rows:
            if row.butler_quotation_item:
                ordered[row.butler_quotation_item] = ordered.get(
                    row.butler_quotation_item, 0) + flt(row.qty)
        return ordered

    def get_ordered_status(self):
        ordered = self.get_ordered_items()
        if not ordered:
            return "Open"
        for row in self.amenities:
            if row.name not in ordered or flt(row.qty) > flt(ordered.get(row.name)):
                return "Partially Ordered"
        return "Ordered"

    def is_fully_ordered(self):
        return self.get_ordered_status() == "Ordered"

    def is_partially_ordered(self):
        return self.get_ordered_status() == "Partially Ordered"

    def validate_valid_till(self):
        if (
            self.valid_till
            and self.transaction_date
            and getdate(self.valid_till) < getdate(self.transaction_date)
        ):
            frappe.throw(
                _("Valid till date cannot be before transaction date"))

    def consolidate_amenities(self):
        """Merge duplicate amenity lines that share the same (amenity, floor_type,
        additional_amenity), summing their qty. Including additional_amenity in the key
        keeps an *included* unit and an *additional* unit of the same amenity+floor on
        separate rows (a Bundle requirement). Runs server-side so every entry point —
        the Facility Builder (which just sends one row per placement) and manual form
        edits — stays consistent.

        Skipped when Butler Settings → "Disable Amenity Consolidation" is on.
        """
        if frappe.db.get_single_value("Butler Settings", "disable_amenity_consolidation"):
            return

        merged = {}  # (amenity, floor_type, additional_amenity) -> kept row
        kept = []
        for row in self.amenities:
            key = (row.amenity, row.floor_type, cint(row.additional_amenity))
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
        self.validate_bundle_amenities(enforce=True)  # block at submit
        self.validate_exchange_rates(enforce=True)  # block at submit

    def validate_bundle_amenities(self, enforce):
        """Bundle composition checks (docs/quotation_pricing/validations.md), Bundle
        orders only:
          • Unfulfilled — an included category has fewer amenities than its configured
            count.
          • Undesignated overflow — an included category has MORE than configured but
            no row is ticked additional_amenity, so the overflow can't be priced.
        Counts sum each line's qty. Both are a non-blocking warning during `validate`
        (enforce=False), and governed by Butler Settings → action_if_bundle_items_
        unfulfilled (+ override role) at `before_submit` (enforce=True).
        """
        if self.order_type != "Bundle" or not self.bundle_type:
            return

        configured = {r.amenity_category: cint(r.amenity_count) for r in self.bundle_items}

        # Resolve the category straight from the Amenity (cached) so the count is
        # reliable regardless of when fetch_from runs in the save/submit flow.
        placed, ticked = {}, set()
        for row in self.amenities:
            if not row.amenity:
                continue
            category = frappe.get_cached_value(
                "Amenity", row.amenity, "amenity_category")
            if not category:
                continue
            placed[category] = placed.get(category, 0) + cint(row.qty)
            if row.additional_amenity:
                ticked.add(category)

        unfulfilled = [
            (c, placed.get(c, 0), n) for c, n in configured.items() if placed.get(c, 0) < n
        ]
        undesignated = [
            c for c, n in configured.items() if placed.get(c, 0) > n and c not in ticked
        ]
        if not unfulfilled and not undesignated:
            return

        message = ""
        if unfulfilled:
            message += _("These bundle categories are not fully filled:") + "<ul>" + "".join(
                "<li>{0} &mdash; selected {1}, required {2}</li>".format(
                    frappe.bold(c), have, want)
                for c, have, want in sorted(unfulfilled)
            ) + "</ul>"
        if undesignated:
            message += _("These categories have extra amenities not marked as additional:") \
                + "<ul>" + "".join(
                    "<li>{0}</li>".format(frappe.bold(c)) for c in sorted(undesignated)
                ) + "</ul>"

        title = _("Bundle items unfulfilled")
        if not enforce:
            frappe.msgprint(message, title=title, indicator="orange")
            return

        apply_governance_action(
            frappe.db.get_single_value(
                "Butler Settings", "action_if_bundle_items_unfulfilled") or "Stop",
            message=message,
            title=title,
            override_role=frappe.db.get_single_value(
                "Butler Settings", "role_to_override_unfulfilled_stop_action"),
        )

    def validate_dependencies(self):
        """Every dependant amenity's required `depends_on` amenities must also be on the
        quotation. Optimised to a single query: gather all dependency links for the
        dependant amenities at once, then check them against the present amenities in memory.
        """
        present = {r.amenity for r in self.amenities if r.amenity}
        dependants = {
            r.amenity for r in self.amenities if r.is_dependant_amenity and r.amenity}
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
                "<li>{0} &rarr; {1}</li>".format(frappe.bold(a),
                                                 ", ".join(sorted(m)))
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
            self.facility and frappe.db.get_value(
                "Facility", self.facility, "facility_type")
        )
        # floor_count = number of DISTINCT floor types used across the amenity lines
        self.floor_count = len(
            {r.floor_type for r in self.amenities if r.floor_type})

        # currency: the exchange_rates table (Currency Exchange Rate) holds one (editable)
        # rate per currency used on the quotation → company currency. The document→company
        # and bundle→company rates are computed locals from it; each amenity's read-only
        # exchange_rate mirrors its currency's row, so a currency always carries one
        # consistent rate. See docs/quotation_pricing/reference.md.
        company_currency = erpnext.get_company_currency(self.company) if self.company else None
        rate_map = self.sync_exchange_rates(company_currency)
        conversion_rate = flt(rate_map.get(self.currency, 1.0)) or 1.0

        amenity_count = 0
        items_total = 0.0
        deviations = []
        for row in self.amenities:
            row.qty = cint(row.qty)
            info = get_amenity_pricing(row.amenity, facility_type)
            row.amenity_currency = info.get("currency")
            # amenity_price stays in the amenity's OWN currency (its standard price);
            # standard_rate is that price converted to the document currency, via the
            # exchange_rates table:  standard_rate = amenity_price × exchange_rate / conversion_rate
            row.exchange_rate = flt(rate_map.get(row.amenity_currency, 1.0)) or 1.0
            row.amenity_price = flt(info["amenity_price"])  # standard price, amenity currency
            resolved = flt(row.amenity_price) * flt(row.exchange_rate) / conversion_rate
            previous_standard = flt(row.standard_rate)
            row.standard_rate = resolved  # the reference standard, in document currency
            # Default rate to the standard, and keep TRACKING it whenever rate still equals
            # the PREVIOUS standard (i.e. wasn't manually overridden) — so a currency or
            # exchange-rate change re-converts the rate instead of leaving a stale value.
            # A genuine override (rate ≠ the previous standard) is preserved.
            if not row.rate or abs(flt(row.rate) - previous_standard) <= 0.005:
                row.rate = resolved
            if abs(flt(row.rate) - resolved) > 0.005:
                # standard-price governance: Amenities/Quotation check every line; a
                # Bundle checks only the ticked additional rows (the included lines are
                # covered by the flat bundle_price). See validations.md.
                if self.order_type != "Bundle" or row.additional_amenity:
                    deviations.append(row)
            # floor-dependent amenities are priced across every distinct floor
            floors = self.floor_count if (
                info["depends_on_floor_count"] and self.floor_count) else 1
            row.amount = flt(floors) * flt(row.rate) * flt(row.qty)
            amenity_count += row.qty
            items_total += flt(row.amount)
        self.amenity_count = amenity_count

        # --- bundle price + default + currency (the bundle is sold at its flat price) ---
        bundle_price_breach = None
        if self.order_type == "Bundle" and self.bundle_type:
            standard_price, bundle_currency, max_discount = frappe.db.get_value(
                "Butler Bundle", self.bundle_type,
                ["bundle_price", "currency", "max_discount"],
            )
            self.bundle_currency = bundle_currency
            # bundle_currency → company comes from the exchange_rates table (computed
            # local); convert the bundle's standard price to the document currency.
            bundle_conversion_rate = flt(rate_map.get(bundle_currency, 1.0)) or 1.0
            self.default_bundle_price = (
                flt(standard_price) * bundle_conversion_rate / conversion_rate)
            # bundle_price is user-editable (it may carry a discount). Seed it from the
            # converted standard price when unset OR when the bundle was just changed
            # (so a client-set raw price is corrected); otherwise keep the user's value.
            if not self.bundle_price or self.has_value_changed("bundle_type"):
                self.bundle_price = flt(self.default_bundle_price)
            bundle_price_breach = self.check_bundle_price_discount(flt(max_discount))
        else:
            self.bundle_price = 0
            self.default_bundle_price = 0
            self.bundle_currency = None

        # standard-price governance is applied in validate (not here), so live recalcs
        # never throw; stash the deviating rows + any bundle_price breach for it.
        self._price_deviations = deviations
        self._bundle_price_breach = bundle_price_breach

        # --- additional amenities (extras beyond the bundle composition) ---
        self.additional_total = (
            self.calculate_additional_total() if self.order_type == "Bundle" else 0
        )

        # --- total: bundle price for a Bundle, else the summed amenities ---
        self.total = flt(self.bundle_price) if self.order_type == "Bundle" else items_total

        # --- document discount → taxes → grand/rounded totals → base mirrors ---
        self.calculate_discount_taxes_and_totals()
        self.set_base_amounts(conversion_rate)

    def sync_exchange_rates(self, company_currency):
        """Maintain the exchange_rates table — one row per DISTINCT non-company currency
        used on the quotation (document currency, each amenity's currency, the bundle's
        currency) → its rate to the company currency. New/blank rows are auto-fetched
        from Currency Exchange; a user-entered rate is preserved. Rows for currencies no
        longer used are dropped. Returns {currency: rate} (company currency → 1).
        """
        if not company_currency:
            self.set("exchange_rates", [])
            return {}

        needed = set()
        if self.currency:
            needed.add(self.currency)
        for row in self.amenities:
            cur = row.amenity_currency or (
                row.amenity and frappe.get_cached_value("Amenity", row.amenity, "currency"))
            if cur:
                needed.add(cur)
        if self.order_type == "Bundle" and self.bundle_currency:
            needed.add(self.bundle_currency)
        needed = {c for c in needed if c and c != company_currency}

        # the exchange_rates table is "Currency Exchange Rate" whose rate field is
        # `conversion_rate` (the row's currency → company)
        existing = {r.currency: flt(r.conversion_rate) for r in self.exchange_rates}
        rows = []
        for cur in sorted(needed):
            rate = existing.get(cur) or self.exchange_to_company(cur, company_currency)
            rows.append({"currency": cur, "conversion_rate": rate})
        self.set("exchange_rates", rows)

        rate_map = {r["currency"]: flt(r["conversion_rate"]) for r in rows}
        rate_map[company_currency] = 1.0
        return rate_map

    def exchange_to_company(self, from_currency, company_currency):
        """Exchange rate from a source currency to the company currency, as of
        transaction_date. 1 when equal/empty; otherwise the Currency Exchange rate, or
        0 when no record exists — left at 0 (not silently 1) so the missing rate shows in
        the table and validate_exchange_rates can flag it, mirroring ERPNext's
        validate_conversion_rate."""
        if not (from_currency and company_currency) or from_currency == company_currency:
            return 1.0
        return flt(get_exchange_rate(
            from_currency, company_currency, self.transaction_date, "for_selling"))

    def calculate_additional_total(self):
        """Charge for amenities beyond the bundle composition, per
        docs/quotation_pricing/additional-amenities.md:
          • category NOT in bundle_items → every row's amount (auto-additional);
          • category IN bundle_items with overflow → floors × (first ticked row's rate)
            × (placed_qty − configured_count); the ticked row supplies the rate/floors,
            the category supplies the overflow quantity.
        """
        configured = {r.amenity_category: cint(r.amenity_count) for r in self.bundle_items}

        rows_by_cat = {}
        for row in self.amenities:
            if not row.amenity:
                continue
            category = frappe.get_cached_value(
                "Amenity", row.amenity, "amenity_category")
            if category:
                rows_by_cat.setdefault(category, []).append(row)

        total = 0.0
        for category, rows in rows_by_cat.items():
            if category not in configured:
                total += sum(flt(r.amount) for r in rows)  # whole category is extra
                continue
            excess = sum(cint(r.qty) for r in rows) - configured[category]
            if excess <= 0:
                continue
            ticked = next((r for r in rows if r.additional_amenity), None)
            if not ticked:
                continue  # undesignated overflow — validate_bundle_amenities warns/blocks
            floors = self.floor_count if (
                frappe.get_cached_value(
                    "Amenity", ticked.amenity, "depends_on_floor_count")
                and self.floor_count
            ) else 1
            total += flt(floors) * flt(ticked.rate) * excess
        return total

    def calculate_discount_taxes_and_totals(self):
        """Document discount → taxes → grand/rounded totals, mirroring ERPNext's
        calculate_taxes_and_totals over Butler's base: the amenity lines (Amenities/
        Quotation) or bundle_price + additional_total (Bundle). See
        docs/quotation_pricing/{discount,taxes_and_charges}.md.

        The document discount (discount_mode + apply_discount_on) is shared
        proportionally between the bundle base (`total`) and the additional amenities
        (`additional_total`); Net-Total mode lowers the net before taxes, Grand-Total
        mode lowers the final grand total.
        """
        gross_bundle = flt(self.total)
        gross_additional = flt(self.additional_total)
        gross = gross_bundle + gross_additional
        total_qty = cint(self.amenity_count)

        # pass 1 (no discount): the pre-discount grand total drives a Grand-Total
        # percentage base and Grand-Total-mode discounting
        taxes0, grand0 = self._apply_taxes(gross, total_qty)

        # resolve the document discount (discount_amount holds the % or the amount)
        base_for_pct = gross if self.apply_discount_on == "Net Total" else grand0
        if self.discount_mode == "Percentage":
            discount = flt(base_for_pct * flt(self.discount_amount) / 100.0)
        elif self.discount_mode == "Amount":
            discount = flt(self.discount_amount)
        else:
            discount = 0.0

        if discount and not self.apply_discount_on:
            frappe.throw(_("Please select Apply Additional Discount On"))

        ceiling = gross if self.apply_discount_on == "Net Total" else grand0
        if discount and ceiling and discount > ceiling + 0.005:
            frappe.throw(
                _("Discount ({0}) cannot exceed the total before discount ({1})").format(
                    fmt_money(discount), fmt_money(ceiling)),
                title=_("Invalid Discount"),
            )

        if self.apply_discount_on == "Net Total" and discount:
            # discount lowers the net before taxes; share it across bundle + additional
            bundle_share = discount * gross_bundle / gross if gross else 0.0
            self.net_total = gross_bundle - bundle_share
            self.additional_net_total = gross_additional - (discount - bundle_share)
            net_base = flt(self.net_total) + flt(self.additional_net_total)
            self.total_taxes_and_charges, self.grand_total = self._apply_taxes(net_base, total_qty)
        else:
            # Grand-Total (or no) discount: net unchanged, discount comes off the grand
            self.net_total = gross_bundle
            self.additional_net_total = gross_additional
            self.total_taxes_and_charges, self.grand_total = taxes0, grand0
            self.grand_total = flt(self.grand_total) - discount

        self._resolved_discount = discount
        self.set_rounded_total()

    def _apply_taxes(self, net_base, total_qty):
        """Compute the `taxes` rows over a single net base, per the documented
        charge_type formulas (taxes_and_charges.md). Sets each row's tax_amount (Actual
        is kept as entered) and cumulative `total`; returns (total_taxes, grand_total).
        """
        rows = self.get("taxes") or []
        running = flt(net_base)
        taxes_total = 0.0
        for i, tax in enumerate(rows):
            rate = flt(tax.rate)
            charge_type = tax.charge_type
            if charge_type == "On Net Total":
                amount = rate / 100.0 * flt(net_base)
            elif charge_type == "On Item Quantity":
                amount = rate * flt(total_qty)
            elif charge_type in ("On Previous Row Amount", "On Previous Row Total"):
                idx = cint(tax.row_id) - 1
                ref = rows[idx] if 0 <= idx < i else None
                base = flt(ref.tax_amount if charge_type == "On Previous Row Amount"
                           else ref.total) if ref else 0.0
                amount = rate / 100.0 * base
            else:  # Actual — entered manually, kept as-is
                amount = flt(tax.tax_amount)
            tax.tax_amount = amount
            tax.tax_amount_after_discount_amount = amount
            running += amount
            tax.total = running
            taxes_total += amount
        grand = running if rows else flt(net_base)
        return flt(taxes_total), flt(grand)

    def set_rounded_total(self):
        """Round grand_total to the smallest currency fraction, mirroring ERPNext's
        set_rounded_total; honours disable_rounded_total."""
        if self.disable_rounded_total:
            self.rounded_total = 0
            self.rounding_adjustment = 0
            return
        currency = self.currency or (
            self.company and frappe.db.get_value("Company", self.company, "default_currency"))
        if currency:
            self.rounded_total = round_based_on_smallest_currency_fraction(
                self.grand_total, currency, self.precision("rounded_total"))
            self.rounding_adjustment = flt(
                flt(self.rounded_total) - flt(self.grand_total),
                self.precision("rounding_adjustment"))
        else:
            self.rounded_total = flt(self.grand_total)
            self.rounding_adjustment = 0

    def set_base_amounts(self, conversion_rate):
        """Company-currency mirrors via the document→company rate (computed from the
        exchange_rates table; defaults to 1)."""
        rate = flt(conversion_rate) or 1.0

        self.base_total = flt(self.total) * rate
        self.base_net_total = flt(self.net_total) * rate
        self.base_additional_total = flt(self.additional_total) * rate
        self.base_additional_net_total = flt(self.additional_net_total) * rate
        self.base_bundle_price = flt(self.bundle_price) * rate
        self.base_default_bundle_price = flt(self.default_bundle_price) * rate
        self.base_total_taxes_and_charges = flt(self.total_taxes_and_charges) * rate
        self.base_grand_total = flt(self.grand_total) * rate
        self.base_rounded_total = flt(self.rounded_total) * rate
        self.base_rounding_adjustment = flt(self.rounding_adjustment) * rate
        self.base_discount_amount = flt(getattr(self, "_resolved_discount", 0.0)) * rate

        for tax in self.get("taxes") or []:
            tax.base_tax_amount = flt(tax.tax_amount) * rate
            tax.base_total = flt(tax.total) * rate
            tax.base_tax_amount_after_discount_amount = flt(
                tax.tax_amount_after_discount_amount) * rate

        # amenity lines (net == gross at line level; the document discount is applied at
        # the header, not redistributed to lines)
        for row in self.amenities:
            row.net_rate = flt(row.rate)
            row.net_amount = flt(row.amount)
            # amenity_price is in the amenity's currency → company via its own exchange_rate;
            # rate/amount are in document currency → company via conversion_rate.
            row.base_amenity_price = flt(row.amenity_price) * flt(row.exchange_rate)
            row.base_rate = flt(row.rate) * rate
            row.base_net_rate = flt(row.net_rate) * rate
            row.base_amount = flt(row.amount) * rate
            row.base_net_amount = flt(row.net_amount) * rate

    def check_bundle_price_discount(self, max_discount):
        """Line-level discount on the bundle, ERPNext item-discount style:
        default_bundle_price (≈ price_list_rate) → bundle_price (≈ rate). Returns an
        HTML `<li>` message when the discount % exceeds the bundle's max_discount, else
        None — fed to enforce_standard_price alongside the row deviations.
        """
        default = flt(self.default_bundle_price)
        if not default:
            return None
        discount_pct = (default - flt(self.bundle_price)) / default * 100.0
        if discount_pct <= flt(max_discount) + 0.005:
            return None
        return "<li>{0}</li>".format(
            _("Bundle price {0} is discounted {1}% — beyond the bundle's maximum {2}% (standard {3})").format(
                fmt_money(self.bundle_price), flt(discount_pct, 2),
                flt(max_discount, 2), fmt_money(default),
            )
        )

    def enforce_standard_price(self, deviations, bundle_price_breach=None):
        """Govern prices that deviate from the standard, per Butler Settings →
        maintain_standard_price_action (Warn → msgprint · Stop → throw, unless the user
        holds role_to_override_standard_price_stop_action, who is warned but allowed).

        Amenities/Quotation: every line whose rate ≠ standard_rate (the standard price in
        document currency). Bundle: only ticked additional rows (collected in
        calculate_totals) plus `bundle_price_breach` when bundle_price is discounted past
        the bundle's max_discount.
        """
        lines = [
            "<li>{0} — {1} (standard {2})</li>".format(
                frappe.bold(r.amenity), fmt_money(r.rate), fmt_money(r.standard_rate)
            )
            for r in deviations
        ]
        if bundle_price_breach:
            lines.append(bundle_price_breach)
        if not lines:
            return

        msg = _("These prices don't keep the standard:") + "<ul>" + "".join(lines) + "</ul>"

        apply_governance_action(
            frappe.db.get_single_value(
                "Butler Settings", "maintain_standard_price_action") or "Stop",
            message=msg,
            title=_("Standard price not maintained"),
            override_role=frappe.db.get_single_value(
                "Butler Settings", "role_to_override_standard_price_stop_action"),
        )


def apply_governance_action(action, *, message, title, override_role=None):
    """Apply a Butler Settings Stop/Warn governance action to a validation message.

    Shared by the standard-price and bundle-fulfilment checks so they behave the same:
      Warn → msgprint (orange) and continue;
      Stop → throw, unless the current user holds `override_role` (then warn + allow).
    """
    if action == "Warn":
        frappe.msgprint(message, title=title, indicator="orange")
        return
    if override_role and override_role in frappe.get_roles():
        frappe.msgprint(
            message + "<br>"
            + _("Overridden by your role: {0}").format(frappe.bold(override_role)),
            title=title,
            indicator="orange",
        )
        return
    frappe.throw(message, title=title)


@frappe.whitelist()
def get_amenity_pricing(amenity, facility_type=None):
    """Single source of truth for an amenity's standard price. Default is the Amenity's
    standard_price; if it has a changeable price and a facility_type_prices row matches,
    that row's price wins. The price is returned **in the amenity's own currency**
    (`currency`); the quotation converts it to the document currency.
    """
    if not amenity:
        return {"amenity_price": 0.0, "depends_on_floor_count": 0, "currency": None}
    am = frappe.get_cached_doc("Amenity", amenity)
    price = flt(am.standard_price)
    if am.has_changeable_price and facility_type:
        for r in am.facility_type_prices or []:
            if r.facility_type == facility_type:
                price = flt(r.amenity_price)
                break
    return {
        "amenity_price": price,
        "depends_on_floor_count": cint(am.depends_on_floor_count),
        "currency": am.currency,
    }


def get_facility_party(facility):
    """Resolve a Facility's quotation party from its Dynamic Links.

    The **Customer takes priority over the Lead** when a facility links to both (a
    Facility links to at most one of each, enforced on the Facility). Single source of
    truth for that priority rule — reused by set_party_from_facility (defaulting the
    quotation's party) and _make_customer (resolving the Sales Order customer).

    Returns ``(quotation_to, party_name)`` — e.g. ``("Customer", "CUST-0001")`` — or
    ``(None, None)`` when the facility links to neither.
    """
    if not facility:
        return None, None

    links = frappe.get_all(
        "Dynamic Link",
        filters={
            "parenttype": "Facility",
            "parent": facility,
            "link_doctype": ["in", ["Customer", "Lead"]],
        },
        fields=["link_doctype", "link_name"],
    )
    customer = next((l.link_name for l in links if l.link_doctype == "Customer"), None)
    if customer:
        return "Customer", customer
    lead = next((l.link_name for l in links if l.link_doctype == "Lead"), None)
    if lead:
        return "Lead", lead
    return None, None


@frappe.whitelist()
def get_facility_party_details(facility):
    """Facility → quotation party for the form's `facility` trigger: the resolved
    quotation_to + party_name (Customer priority) and the party's display name, so the
    form can default them when a facility is picked. Returns ``{}`` for no linked party.
    """
    quotation_to, party_name = get_facility_party(facility)
    if not party_name:
        return {}
    return {
        "quotation_to": quotation_to,
        "party_name": party_name,
        "customer_name": get_party_name(quotation_to, party_name),
    }


def get_party_name(quotation_to, party_name):
    """Display name for a Customer / Lead / Prospect party, mirroring ERPNext's
    Quotation.set_customer_name. Returns None when there's nothing to resolve."""
    if not (quotation_to and party_name):
        return None

    if quotation_to == "Customer":
        return frappe.db.get_value("Customer", party_name, "customer_name")
    if quotation_to == "Lead":
        lead_name, company_name = frappe.db.get_value(
            "Lead", party_name, ["lead_name", "company_name"]
        )
        return company_name or lead_name
    if quotation_to == "Prospect":
        return party_name
    return None


@frappe.whitelist()
def get_party_details(party_name, quotation_to):
    """Fetch a Butler Quotation's party details, mirroring ERPNext's
    `erpnext.accounts.party.get_party_details` for the subset Butler needs:
    the party's display name, its default billing Address (+ rendered display),
    and its default Contact (+ display / mobile / email).

    Called from the form's `party_name` trigger; the company address is resolved
    separately on the `company` trigger, exactly like ERPNext.
    """
    from frappe.contacts.doctype.address.address import get_address_display, get_default_address
    from frappe.contacts.doctype.contact.contact import get_contact_details, get_default_contact

    out = frappe._dict()
    if not (party_name and quotation_to):
        return out

    out.customer_name = get_party_name(quotation_to, party_name)

    # default billing address for the party (via its Dynamic Links)
    address = get_default_address(quotation_to, party_name)
    out.customer_address = address
    out.customer_address_display = get_address_display(
        address) if address else ""

    # default contact for the party
    contact = get_default_contact(quotation_to, party_name)
    out.contact_person = contact
    if contact:
        out.update(get_contact_details(contact))
    else:
        out.update(
            {"contact_display": "", "contact_email": "", "contact_mobile": ""})

    return out


@frappe.whitelist()
def get_facility_address_display(facility):
    """Rendered default Address linked to a Facility, for the read-only
    facility_address display. Facility links to Address via Dynamic Link, so
    this mirrors how customer_address_display / company_address_display are
    resolved. Returns "" when the Facility has no (or no linked) Address."""
    from frappe.contacts.doctype.address.address import get_address_display, get_default_address

    if not facility:
        return ""
    address = get_default_address("Facility", facility)
    return get_address_display(address) if address else ""


@frappe.whitelist()
def make_sales_order(source_name, target_doc=None):
    return _make_sales_order(source_name, target_doc)


def _make_sales_order(source_name, target_doc=None, ignore_permissions=False):
    """Map a Butler Quotation to a Sales Order, mirroring ERPNext's Quotation:
    each amenity line becomes a Sales Order Item (item_code = the Amenity's linked
    Item), only the not-yet-ordered balance is mapped (partial ordering), and the
    line keeps back-links to the quotation + row so status can be recomputed.
    """
    source = frappe.get_doc("Butler Quotation", source_name)

    if source.order_type != "Amenities":
        frappe.throw(
            _("Creating a Sales Order is currently supported only for Amenities quotations."))

    if not frappe.db.get_single_value(
        "Selling Settings", "allow_sales_order_creation_for_expired_quotation"
    ):
        if source.valid_till and (
            getdate(source.valid_till) < getdate(source.transaction_date)
            or getdate(source.valid_till) < getdate(nowdate())
        ):
            frappe.throw(_("Validity period of this quotation has ended."))

    customer = _make_customer(source_name, ignore_permissions)
    ordered_items = source.get_ordered_items()

    # the quotation's document→company rate (its exchange_rates row for the document
    # currency; 1 when the quotation currency is the company currency / no row). All
    # amenity rates are already in the document currency, so this single rate is all the
    # Sales Order needs to reconcile its base (company-currency) amounts to the quotation.
    doc_conversion_rate = next(
        (flt(r.conversion_rate) for r in source.exchange_rates
         if r.currency == source.currency), 1.0)

    def set_missing_values(src, target):
        if customer:
            target.customer = customer.name
            target.customer_name = customer.customer_name
        if source.currency:
            target.currency = source.currency  # don't let party defaults flip it
        target.ignore_pricing_rule = 1  # keep the already-converted amenity rates intact
        target.flags.ignore_permissions = ignore_permissions
        target.run_method("set_missing_values")
        # carry the quotation's rate (after set_missing_values, so it isn't re-fetched)
        if doc_conversion_rate:
            target.conversion_rate = doc_conversion_rate
        target.run_method("calculate_taxes_and_totals")

    def update_item(obj, target, source_parent):
        item_code = frappe.db.get_value("Amenity", obj.amenity, "amenity_item")
        if not item_code:
            frappe.throw(
                _("Amenity {0} has no linked Item, so it can't be added to a Sales Order.").format(
                    frappe.bold(obj.amenity)
                )
            )
        target.item_code = item_code
        balance_qty = flt(obj.qty) - flt(ordered_items.get(obj.name, 0))
        target.qty = balance_qty if balance_qty > 0 else 0
        target.rate = obj.rate

    def can_map_row(obj):
        return flt(obj.qty) > flt(ordered_items.get(obj.name, 0))

    doclist = get_mapped_doc(
        "Butler Quotation",
        source_name,
        {
            "Butler Quotation": {
                "doctype": "Sales Order",
                "validation": {"docstatus": ["=", 1]},
            },
            "Butler Quotation Item": {
                "doctype": "Sales Order Item",
                "field_map": {"parent": "butler_quotation", "name": "butler_quotation_item"},
                "postprocess": update_item,
                "condition": can_map_row,
            },
        },
        target_doc,
        set_missing_values,
        ignore_permissions=ignore_permissions,
    )

    return doclist


def _make_customer(source_name, ignore_permissions=False):
    """Resolve the Sales Order customer from the quotation's Facility, mirroring
    ERPNext's _make_customer: use the linked Customer; otherwise take the linked
    Lead and convert it to a Customer (reusing one if it already exists)."""
    facility = frappe.db.get_value("Butler Quotation", source_name, "facility")
    if not facility:
        return None

    # same Customer-priority resolution the quotation's party uses
    quotation_to, party_name = get_facility_party(facility)
    if quotation_to == "Customer":
        return frappe.get_doc("Customer", party_name)
    if quotation_to != "Lead":
        frappe.throw(
            _("Link a Customer or Lead to Facility {0} before creating a Sales Order.").format(
                frappe.bold(facility)
            )
        )

    # only a Lead is linked → reuse the Customer it was already converted to, else convert it
    existing_customer = frappe.db.get_value("Customer", {"lead_name": party_name})
    if existing_customer:
        return frappe.get_doc("Customer", existing_customer)

    from erpnext.crm.doctype.lead.lead import _make_customer as create_customer_from_lead

    new_customer = create_customer_from_lead(
        party_name, ignore_permissions=ignore_permissions)
    new_customer.flags.ignore_permissions = ignore_permissions
    new_customer.insert(ignore_permissions=ignore_permissions)
    return new_customer
