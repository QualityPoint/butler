# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import json
import math
from collections import deque

import erpnext
import frappe
from butler.butler.doctype.annex.annex import get_annex_default_uom
from erpnext.controllers.accounts_controller import AccountsController
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


# Fields that only make sense on an ANNEX row — cleared on an amenity row.
ANNEX_ROW_FIELDS = (
    "annex_quantity", "annex_uom", "annex_stock_uom", "conversion_factor",
    "annex_price_list", "annex_price", "annex_amount",
    "qtn_annex_price", "qtn_annex_net_price", "qtn_annex_amount", "qtn_annex_net_amount",
    "base_annex_price", "base_annex_net_price", "base_annex_amount", "base_annex_net_amount",
)

# Fields that only make sense on an AMENITY row — cleared on an annex row. The amenity's
# own price ladder is derived, so it is cleared too rather than carried per annex.
AMENITY_ROW_FIELDS = (
    "amenity_qty", "amenity_price", "qtn_amenity_price", "quotation_price_changed",
    "qtn_amenity_net_price", "qtn_amenity_amount", "qtn_amenity_net_amount",
    "base_amenity_price", "base_amenity_net_price", "base_amenity_amount",
    "base_amenity_net_amount",
    "light_system", "light_system_device", "used_lines", "total_lines", "light_system_price",
    "light_system_amount", "light_system_pricing_mode",
    "qtn_light_system_price", "qtn_light_system_amount",
    "base_light_system_price", "base_light_system_amount",
    "default_system", "default_system_lines", "default_system_pricing_mode",
    "default_system_price", "default_system_amount",
    "qtn_default_system_price", "qtn_default_system_amount",
    "base_default_system_price", "base_default_system_amount",
    "has_sound_system", "sound_system_price", "sound_system_amount",
    "qtn_sound_system_price", "qtn_sound_system_amount",
    "base_sound_system_price", "base_sound_system_amount",
    "floor_price", "floor_qty", "floor_amount",
    "qtn_floor_price", "qtn_floor_amount",
    "base_floor_price", "base_floor_amount",
)


def fill_fetched_fields(row):
    """Copy a row's `fetch_from` values (the annex's name, category, manufacturer, icon…
    and the amenity's category, manager, image…) onto it now.

    Frappe copies them in `_validate_links`, which runs *before* `before_validate`
    (Document._save) — so a row added in before_validate, as expand_amenity_rows does,
    would otherwise stay blank until the quotation's next save. fetch_if_empty fields keep
    a value already there, the way Frappe treats them.
    """
    for link_field, doctype in (("amenity", "Amenity"), ("annex", "Annex")):
        link = row.get(link_field)
        fields = row.meta.get_fields_to_fetch(link_field) if link else []
        if not fields:
            continue
        values = frappe.get_cached_value(
            doctype, link, [df.fetch_from.split(".", 1)[1] for df in fields], as_dict=True) or {}
        for df in fields:
            if df.fetch_if_empty and row.get(df.fieldname):
                continue
            row.set(df.fieldname, values.get(df.fetch_from.split(".", 1)[1]))


def matches_composition(annex_rows, master):
    """Whether an amenity's annex rows are its Amenity's list: the same annexes in the same
    quantities, and the same UOM wherever the Amenity names one (a blank master UOM is
    resolved on pricing, so it is not compared)."""
    def key(annex, qty, uom):
        return (annex, round(flt(qty), 6), uom or "")
    have = sorted(key(r.annex, r.annex_quantity, r.annex_uom if any(m.uom for m in master if m.annex == r.annex) else "")
                  for r in annex_rows)
    want = sorted(key(m.annex, m.qty, m.uom) for m in master)
    return have == want


def get_amenity_item(amenity):
    """The Item an Amenity is sold as, for the Sales Order mapping. The link is the
    Amenity's own `amenity` field (it was `amenity_item` before the annex refactor)."""
    item = frappe.get_cached_value("Amenity", amenity, "amenity") if amenity else None
    if not item:
        frappe.throw(
            _("Amenity {0} has no linked Item, so it can't be added to a Sales Order.").format(
                frappe.bold(amenity)
            )
        )
    return item


def get_annex_uom_conversion(annex, uom):
    """An annex's stock UOM and the factor converting `uom` into it, resolved through the
    Annex's Item — reusing ERPNext's own `get_conversion_factor` so Butler follows the
    same UOM Conversion Detail rules as a Sales Order line.

    The factor is for the downstream stock quantity only. The annex rate is quoted *per
    `uom`*, so applying the factor to money as well would double-count it.
    """
    item = frappe.db.get_value("Annex", annex, "annex_item") if annex else None
    if not item:
        return None, 1.0

    stock_uom = frappe.db.get_value("Item", item, "stock_uom")
    if not uom or uom == stock_uom:
        return stock_uom, 1.0

    from erpnext.stock.get_item_details import get_conversion_factor

    return stock_uom, flt(get_conversion_factor(item, uom).get("conversion_factor")) or 1.0


# What a re-save must NOT throw away. The Facility Builder replaces the whole amenities
# table on every save, so anything the quotation itself owns has to be carried across from
# the stored rows or it is destroyed — see carry_forward_overrides.
#
# The standard mirrors are in here for a reason that is easy to miss: track_add_on_price
# decides keep-or-re-derive by comparing the stored price against `previous_standard x
# previous_qtn_rate`, and it reads previous_standard off the row. Carry only the qtn_ price
# and previous_standard arrives as 0, the comparison fails, and a Quotation Price that was
# only following its standard is misread as changed and frozen for good.
AMENITY_CARRY_FIELDS = (
    "qtn_light_system_price", "light_system_price",
    "qtn_sound_system_price", "sound_system_price",
    "qtn_floor_price", "floor_price",
    "qtn_exchange_rate",
)

ANNEX_CARRY_FIELDS = ("qtn_annex_price", "qtn_exchange_rate")


class ButlerQuotation(Document):
    # --- Payment Schedule (Payment Terms Template -> Payment Schedule table) ----------
    # Reused verbatim from ERPNext's AccountsController -- the single source of truth
    # ERPNext's own Quotation/Sales Order/Sales Invoice all share -- instead of
    # reimplementing the same distribution/validation math here. Borrowed as plain
    # methods (method resolution only, NOT multiple inheritance), so ONLY this specific
    # behaviour is picked up: AccountsController's other lifecycle hooks (on_submit,
    # on_cancel, on_trash, before_print, GL postings, ...) never run against Butler
    # Quotation, since ButlerQuotation isn't actually an AccountsController subclass.
    get_party = AccountsController.get_party
    set_payment_schedule = AccountsController.set_payment_schedule
    validate_payment_schedule_amount = AccountsController.validate_payment_schedule_amount

    def _validate_links(self):
        # Frappe checks every Link before before_validate runs. `annex_price_list` points at
        # an Annex Price that an Amenity edit may have deleted since (remove_stale_annex_
        # prices), and pricing re-resolves it on every save anyway — so a dangling one is
        # cleared first instead of failing the save with "Could not find … Annex Price List".
        self.clear_stale_annex_price_links()
        return super()._validate_links()

    def clear_stale_annex_price_links(self):
        linked = {row.annex_price_list for row in self.amenities if row.annex_price_list}
        if not linked:
            return
        existing = set(frappe.get_all("Annex Price", filters={"name": ["in", list(linked)]}, pluck="name"))
        for row in self.amenities:
            if row.annex_price_list and row.annex_price_list not in existing:
                row.annex_price_list = None

    def before_validate(self):
        self.set_default_company()
        self.set_default_valid_till()
        self.set_party_from_facility()
        self.set_default_terms()
        self.set_default_taxes()
        self.clear_additional_amenities()
        self.clear_row_type_fields()
        self.ensure_placement_ids()
        self.expand_amenity_rows()
        self.carry_forward_overrides()
        self.order_amenity_rows()

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
        for field, value in get_party_details(
            self.party_name, self.quotation_to, self.company
        ).items():
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

    def set_default_terms(self):
        """Auto-fill tc_name and terms from the Company's default_selling_terms when
        the quotation doesn't already carry either — mirrors selling_controller behaviour.
        """
        if self.tc_name or self.terms or not self.company:
            return

        default_terms = frappe.get_value("Company", self.company, "default_selling_terms")
        if not default_terms:
            return

        self.tc_name = default_terms
        self.terms = frappe.get_value("Terms and Conditions", self.tc_name, "terms")

    def set_default_taxes(self):
        """Load the Company's default Sales Taxes and Charges Template when the quotation
        carries no taxes of its own.

        ERPNext applies this default **client-side only** — transaction.js
        `onload_post_render` -> `apply_default_taxes` — so a document inserted without a
        form gets no taxes at all. That is fine for ERPNext, whose documents are made on
        a form; Butler's are also made by the Facility Builder, which posts a plain dict
        to `frappe.client.insert` and never opens one. Doing it here instead covers every
        entry point — the builder, the API, a data import — rather than just the form.

        The guards match `apply_default_taxes`'s own: a template already chosen is left
        alone, and so is a taxes table filled in by hand with no template behind it —
        there is nothing to default in either case. `butler_quotation.js` still runs its
        client-side copy, which now finds the work already done and no-ops.
        """
        if self.taxes_and_charges or self.get("taxes") or not self.company:
            return

        from erpnext.controllers.accounts_controller import get_default_taxes_and_charges

        default = get_default_taxes_and_charges(
            "Sales Taxes and Charges Template", company=self.company) or {}
        if not default.get("taxes_and_charges"):
            return

        self.taxes_and_charges = default["taxes_and_charges"]
        self.set("taxes", default.get("taxes") or [])

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
        # not pricing: reads the line split calculate_totals just settled, moves no money
        self.set_light_system_devices()
        # Payment Schedule needs the final grand_total/base_grand_total above, exactly
        # like ERPNext's own validate_non_invoice_documents_schedule runs after
        # calculate_taxes_and_totals.
        self.set_payment_schedule()
        self.validate_payment_schedule_dates()
        self.validate_payment_schedule_amount()
        # governance runs on save only (calculate_totals stays throw-free for live recalc).
        # A system save (sync_with_amenities) skips it: it reprices nothing a user chose,
        # and a price someone deliberately changed earlier must not stop it.
        if not self.flags.get("ignore_price_governance"):
            self.enforce_annex_price(
                getattr(self, "_price_deviations", []),
                getattr(self, "_bundle_price_breach", None),
            )
        self.validate_row_types()
        self.validate_bundle_amenities(enforce=False)  # warn while editing
        self.validate_dependencies(enforce=False)  # warn while editing
        self.validate_system_core(enforce=False)  # warn while editing
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
        on any pricing input change.

        Also re-runs set_payment_schedule (throw-free, unlike its date/amount validators)
        so the Payment Schedule grid's amounts track the live grand_total instead of
        going stale until save — Butler's rule (unlike ERPNext's) is that any pricing
        input change recalculates live."""
        self.set_bundle_breakdown()
        self.calculate_totals()
        self.set_light_system_devices()
        self.set_payment_schedule()

    def validate_taxes(self):
        """Per-row sanity of the Sales Taxes and Charges rows (charge_type ↔ row_id,
        and inclusive-tax eligibility), reusing ERPNext's validators verbatim — same
        checks its calculate_taxes_and_totals runs. See _resolve_exclusive_gross for
        how an inclusive row is priced (docs/quotation_pricing/taxes_and_charges.md)."""
        from erpnext.controllers.accounts_controller import (
            validate_inclusive_tax,
            validate_taxes_and_charges,
        )
        for tax in self.get("taxes") or []:
            validate_taxes_and_charges(tax)
            validate_inclusive_tax(tax, self)

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
        static (Customer, Lead) so this is just a sanity check."""
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
        if self.lost_reasons:
            self.lost_reasons = []
        self.set_status(update=True)

    @frappe.whitelist()
    def declare_enquiry_lost(self, lost_reasons_list, competitors, detailed_reason=None):
        import json

        if self.is_fully_ordered() or self.is_partially_ordered():
            frappe.throw(_("Cannot set as Lost as Sales Order is made."))

        if isinstance(lost_reasons_list, str):
            lost_reasons_list = json.loads(lost_reasons_list)
        if isinstance(competitors, str):
            competitors = json.loads(competitors)

        valid_lost_reasons = [
            r.name for r in frappe.get_list("Quotation Lost Reason", fields=["name"])
        ]

        self.db_set("status", "Lost")

        if detailed_reason:
            self.db_set("order_lost_reason", detailed_reason)

        for reason in lost_reasons_list:
            if reason.get("lost_reason") in valid_lost_reasons:
                self.append("lost_reasons", reason)
            else:
                frappe.throw(
                    _("Invalid lost reason {0}, please create a new lost reason.").format(
                        frappe.bold(reason.get("lost_reason"))
                    )
                )

        for competitor in competitors:
            self.append("competitors", competitor)

        self.save()

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
        # only amenity rows reach a Sales Order — annex rows are quotation-only detail
        ordered = self.get_ordered_items()
        if not ordered:
            return "Open"
        for row in self.amenities:
            if row.annex:
                continue
            if row.name not in ordered or flt(row.amenity_qty) > flt(ordered.get(row.name)):
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

    def validate_row_types(self):
        """Each row must be a complete example of its type.

        The two row types share one doctype, so the mandatory flags that would normally
        express this can't live on the fields (`annex_uom` reqd would block every amenity
        row). They are enforced here instead, per type.
        """
        groups, orphans = self.group_amenity_rows()

        if orphans:
            names = ", ".join(sorted({frappe.bold(r.annex) for r in orphans if r.annex}))
            frappe.throw(
                _("These annexes don't belong to any amenity on the quotation: {0}").format(names),
                title=_("Unattached annex"),
            )

        for amenity_row, annex_rows in groups:
            # An amenity IS its annexes — `Amenity.annexes` is a mandatory table on the
            # master, so a placement stripped to none contradicts the very thing it is a
            # placement of, and prices out at nothing. `annexes_customised` still lets a
            # placement drop SOME of them; it cannot drop them all.
            if not annex_rows:
                frappe.throw(
                    _("Row #{0}: {1} has no annexes. An amenity is what it is composed of "
                      "— keep at least one, or remove the amenity itself.").format(
                        amenity_row.idx, frappe.bold(amenity_row.amenity)),
                    title=_("Nothing fitted"),
                )

            # The annex rows first, then the price they roll up into. A negative quantity
            # makes the amenity price negative too, and reporting the roll-up first would
            # blame the light system for something an annex did.
            allowed = {r.annex for r in frappe.get_cached_doc(
                "Amenity", amenity_row.amenity).annexes}
            for annex_row in annex_rows:
                if flt(annex_row.annex_quantity) <= 0:
                    frappe.throw(
                        _("Row #{0}: {1} needs a quantity greater than zero. Remove the "
                          "annex instead of setting it to {2}.").format(
                            annex_row.idx, frappe.bold(annex_row.annex),
                            flt(annex_row.annex_quantity)),
                        title=_("Invalid quantity"),
                    )
                if not annex_row.annex_uom:
                    frappe.throw(
                        _("Row #{0}: Annex UOM is required.").format(annex_row.idx),
                        title=_("Missing UOM"),
                    )
                if annex_row.annex not in allowed:
                    frappe.throw(
                        _("Row #{0}: {1} is not an annex of {2}.").format(
                            annex_row.idx, frappe.bold(annex_row.annex),
                            frappe.bold(amenity_row.amenity)),
                        title=_("Annex not configured"),
                    )

            # A Subtract light system is a legitimate credit, so a line is allowed to carry
            # a negative amount — but not to end up worth less than nothing. Reported here
            # rather than by the field's non_negative flag, which names the wrong culprit.
            if flt(amenity_row.amenity_price) < 0:
                subtracting = amenity_row.light_system_pricing_mode == "Subtract"
                frappe.throw(
                    _("Row #{0}: {1} prices out at {2}. Its {3} light system subtracts more "
                      "than the amenity is worth.").format(
                        amenity_row.idx, frappe.bold(amenity_row.amenity),
                        fmt_money(amenity_row.amenity_price),
                        frappe.bold(amenity_row.light_system),
                    ) if subtracting else
                    _("Row #{0}: {1} prices out at {2}. What it is composed of is worth "
                      "less than nothing.").format(
                        amenity_row.idx, frappe.bold(amenity_row.amenity),
                        fmt_money(amenity_row.amenity_price),
                    ),
                    title=_("Negative amenity price"),
                )

    def validate_payment_schedule_dates(self):
        """Reuses ERPNext's own duplicate-due-date / discount-date-ordering checks
        (AccountsController.validate_payment_schedule_dates) verbatim, then adds the one
        rule that function only applies via a literal `self.doctype in ["Sales Order",
        "Quotation"]` check — which "Butler Quotation" can never match: a row's due date
        can't fall before the transaction date.
        """
        AccountsController.validate_payment_schedule_dates(self)
        for d in self.get("payment_schedule") or []:
            if d.due_date and getdate(d.due_date) < getdate(self.transaction_date):
                frappe.throw(
                    _("Row {0}: Due Date in the Payment Schedule cannot be before the Transaction Date")
                    .format(d.idx)
                )

    # --- row model: amenity rows and their annex rows ---------------------------------
    # The `amenities` table holds two kinds of row. A row with no `annex` is an AMENITY
    # row: it carries the amenity's quantity and its per-amenity add-ons (light system,
    # sound system, floor extra). A row with an `annex` is an ANNEX row belonging to the
    # amenity row above it. See docs/quotation_pricing/annexes.md.

    def ensure_placement_ids(self):
        """Give every row a `placement_id`, and make sure each annex row names one that
        exists on this document.

        A placement id identifies one drawn amenity — the Facility Builder's `room.id`,
        which it sends with each row. Nothing else does: a row typed into the form, a data
        import, a `frappe.client.insert` caller. So this is not migration scaffolding, it
        runs forever, and it is why no patch is needed for documents saved before the
        field existed — the migration is each document's next save.

        An annex row is adopted by the *nearest preceding* amenity row, which is
        well-defined because `order_amenity_rows` re-establishes that contiguity on every
        save. An annex row before any amenity row is left unstamped, so
        `validate_row_types` still reports it as unattached.
        """
        current = None
        for row in self.amenities:
            if not row.annex:
                if not row.placement_id:
                    row.placement_id = frappe.generate_hash(length=8)
                current = row.placement_id
                continue
            if current and not row.placement_id:
                row.placement_id = current

        # A stale id is as bad as a missing one: a row edited outside the builder can name
        # a placement no longer on the document, which would read as an orphan and throw
        # on a document nobody touched. Re-home those the same way.
        known = {row.placement_id for row in self.amenities if not row.annex}
        current = None
        for row in self.amenities:
            if not row.annex:
                current = row.placement_id
            elif current and row.placement_id not in known:
                row.placement_id = current

    def group_amenity_rows(self):
        """Pair every amenity row with its annex rows, by `placement_id`.

        Identity is explicit, so grouping no longer depends on where a row sits in the
        table: `order_amenity_rows` keeps the layout tidy but is no longer what makes the
        pairing correct. `ensure_placement_ids` guarantees every row carries a usable id
        before this runs.

        Returns ``(groups, orphans)`` where groups is ``[(amenity_row, [annex_row, ...])]``
        and orphans are annex rows that match no amenity row.
        """
        groups = []
        orphans = []
        at = {}  # placement id -> index of its group

        for row in self.amenities:
            if not row.annex:
                at[row.placement_id] = len(groups)
                groups.append((row, []))
                continue

            position = at.get(row.placement_id)
            if position is None:
                orphans.append(row)
            else:
                groups[position][1].append(row)

        return groups, orphans

    def set_amenity_rows(self, rows):
        """Replace the table with `rows`, renumbering idx to match the new order."""
        for idx, row in enumerate(rows, start=1):
            row.idx = idx
        self.amenities = rows

    def carry_forward_overrides(self):
        """Carry the quotation's own figures onto rows that have just been rebuilt.

        The Facility Builder posts a fresh `amenities` table on every save — new rows, no
        names, no prices. Without this, saving the layout would wipe every changed Quotation
        Price and every additional-amenity designation on the quotation. `placement_id` is what
        makes the match possible: it survives the rebuild because the builder sends it.

        This only restores what the incoming row left blank, so a form save that genuinely
        sets a new price still wins. And it does not decide whether a carried Quotation Price
        has been changed — `price_annex_row` and `track_add_on_price` already do that, by comparing
        against the standard at the row's previous rate. All that was missing was the value
        to compare.

        Runs after `expand_amenity_rows`, so seeded rows are carried onto too.
        """
        before = self.get_doc_before_save()
        if not before:
            return  # an insert has nothing to carry

        stored_amenity = {}
        stored_annex = {}
        for row in before.amenities:
            if not row.placement_id:
                continue
            if not row.annex:
                stored_amenity[row.placement_id] = row
                continue
            # a placement may legitimately hold the same annex twice, so queue them and
            # pair by order of appearance rather than collapsing them onto one another
            key = (row.placement_id, row.annex, row.annex_uom)
            stored_annex.setdefault(key, deque()).append(row)

        # the additional_amenity flag is set on the form and never sent by the builder, so
        # it needs carrying too — but only where it means anything. clear_additional_
        # amenities has already blanked it for a non-Bundle order, and it stays blanked.
        carry_designation = self.order_type == "Bundle"

        # "Reset Amenity" clears these rooms' Quotation Prices on purpose; carrying the old
        # ones back would undo it
        reset_prices = self.flags.get("reset_prices") or set()

        for amenity_row, annex_rows in self.group_amenity_rows()[0]:
            if amenity_row.placement_id in reset_prices:
                continue
            prior = stored_amenity.get(amenity_row.placement_id)
            if prior:
                for fieldname in AMENITY_CARRY_FIELDS:
                    if not flt(amenity_row.get(fieldname)):
                        amenity_row.set(fieldname, prior.get(fieldname))
                if carry_designation and not amenity_row.additional_amenity:
                    amenity_row.additional_amenity = prior.additional_amenity

            for annex_row in annex_rows:
                queue = stored_annex.get(
                    (amenity_row.placement_id, annex_row.annex, annex_row.annex_uom))
                if not queue:
                    continue
                prior = queue.popleft()
                for fieldname in ANNEX_CARRY_FIELDS:
                    if not flt(annex_row.get(fieldname)):
                        annex_row.set(fieldname, prior.get(fieldname))

    def order_amenity_rows(self):
        """Lay the table out as amenity row → its annex rows, group after group, keeping
        every placement of one amenity together.

        Cosmetic, not load-bearing: `group_amenity_rows` pairs rows by `placement_id`, so
        nothing depends on the order. But one row per placement means a plan drawn
        kitchen → office → kitchen reads back that way, and two lines of the same amenity
        separated by a third is exactly what makes a long quotation hard to check.

        Floor first, then amenity within it, both by **first appearance** rather than by
        name: the duplicates come together without reordering anything else, so the table
        still follows the order the floors and amenities were actually drawn in. Ranking
        the floor separately is what keeps a floor's lines contiguous — keying on the pair
        alone would let a second floor's amenity slot in between two of the first's.
        """
        groups, orphans = self.group_amenity_rows()

        floor_rank = {}
        amenity_rank = {}
        decorated = []
        for index, (amenity_row, annex_rows) in enumerate(groups):
            floor = amenity_row.floor_type or ""
            bucket = (floor, amenity_row.amenity or "")
            floor_rank.setdefault(floor, len(floor_rank))
            amenity_rank.setdefault(bucket, len(amenity_rank))
            decorated.append(
                (floor_rank[floor], amenity_rank[bucket], index, amenity_row, annex_rows)
            )

        ordered = []
        for *_, amenity_row, annex_rows in sorted(decorated, key=lambda d: d[:3]):
            ordered.append(amenity_row)
            ordered.extend(annex_rows)
        ordered.extend(orphans)  # kept so validate_row_types can report them
        self.set_amenity_rows(ordered)

    def clear_row_type_fields(self):
        """Blank the fields that don't belong to a row's type — annex pricing on an
        amenity row, and the per-amenity add-ons on an annex row.

        Cleared rather than rejected: the two row types share one doctype, so a field
        left over from the wrong type is stale data, not a user error worth blocking on.
        """
        for row in self.amenities:
            for fieldname in (ANNEX_ROW_FIELDS if not row.annex else AMENITY_ROW_FIELDS):
                row.set(fieldname, None)

    def expand_amenity_rows(self):
        """Give each amenity row its annex rows from its Amenity's own `annexes` table.

        Every entry point — the Facility Builder, a data import, the API — only has to
        send the amenity row (amenity + floor_type) and gets a fully composed quotation
        line back. Seeded straight from the master: one quotation row is one drawn
        placement, so the master's quantities need no scaling.

        An amenity **not** flagged `annexes_customised` follows its Amenity: when its annex
        rows no longer match the Amenity's list (an annex added to or removed from the
        Amenity since), they are re-seeded — the same thing a Facility Builder save does. A
        matching group is left alone, so an ordinary save doesn't churn its rows. Changed
        Quotation Prices on annexes that stay are carried back by carry_forward_overrides.
        Without this, removing an annex from an Amenity made every draft that still held
        it unsavable.

        A group flagged `annexes_customised` is never touched: the flag is how a placement
        says "these annexes are mine, including none at all".
        """
        groups, orphans = self.group_amenity_rows()
        ordered = []

        for amenity_row, annex_rows in groups:
            ordered.append(amenity_row)
            if cint(amenity_row.annexes_customised) or not amenity_row.amenity:
                ordered.extend(annex_rows)
                continue

            master = frappe.get_cached_doc("Amenity", amenity_row.amenity).annexes
            if annex_rows and matches_composition(annex_rows, master):
                ordered.extend(annex_rows)
                continue

            for source in master:
                row = self.append("amenities", {
                    "placement_id": amenity_row.placement_id,
                    "amenity": amenity_row.amenity,
                    "floor_type": amenity_row.floor_type,
                    "additional_amenity": amenity_row.additional_amenity,
                    "annex": source.annex,
                    "annex_quantity": flt(source.qty),
                    "annex_uom": source.uom,
                })
                fill_fetched_fields(row)
                ordered.append(row)

        ordered.extend(orphans)
        self.set_amenity_rows(ordered)

    def before_submit(self):
        self.validate_dependencies(enforce=True)  # block at submit
        self.validate_system_core(enforce=True)  # block at submit
        self.validate_bundle_amenities(enforce=True)  # block at submit
        self.validate_exchange_rates(enforce=True)  # block at submit

    def validate_bundle_amenities(self, enforce):
        """Bundle composition checks (docs/quotation_pricing/validations.md), Bundle
        orders only:
          • Unfulfilled — an included category has fewer amenities than its configured
            count.
          • Undesignated overflow — an included category holds MORE than configured once
            the ticked rows are set aside, so the surplus can't be priced.

        Both are measured on `included = placed − ticked`: every row is one placement, and
        a ticked one is an extra being charged separately, so what the bundle actually
        covers is the rest. Counting ticks rather than noting "this category has at least
        one" is what stops a single tick licensing an overflow of any size.

        Both are a non-blocking warning during `validate`
        (enforce=False), and governed by Butler Settings → action_if_bundle_items_
        unfulfilled (+ override role) at `before_submit` (enforce=True).
        """
        if self.order_type != "Bundle" or not self.bundle_type:
            return

        configured = {r.amenity_category: cint(r.amenity_count) for r in self.bundle_items}

        # Resolve the category straight from the Amenity (cached) so the count is
        # reliable regardless of when fetch_from runs in the save/submit flow.
        placed, ticked = {}, {}
        for row in self.amenities:
            if row.annex or not row.amenity:
                continue  # bundle composition counts amenities, not their annexes
            category = frappe.get_cached_value(
                "Amenity", row.amenity, "amenity_category")
            if not category:
                continue
            placed[category] = placed.get(category, 0) + 1
            if row.additional_amenity:
                ticked[category] = ticked.get(category, 0) + 1

        def included(category):
            return placed.get(category, 0) - ticked.get(category, 0)

        unfulfilled = [
            (c, included(c), n) for c, n in configured.items() if included(c) < n
        ]
        undesignated = [c for c, n in configured.items() if included(c) > n]
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
                    "<li>{0} &mdash; {1} beyond the bundle, none ticked</li>".format(
                        frappe.bold(c), included(c) - configured[c])
                    for c in sorted(undesignated)
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

    def validate_dependencies(self, enforce):
        """A dependant amenity may not outnumber the primary amenities it requires.

        For every amenity `D` flagged `is_dependant_amenity`, and every `P` in its
        `depends_on` table:

            count(D placements)  <=  count(P placements)

        An Intercom needs an Entrance to be fitted to, so three Intercoms need three
        Entrances. Mere presence is the `capacity == 0` case of the same rule, which is
        why there is no separate presence check.

        **This never touches money.** Both amenities are drawn separately and priced
        independently — the Entrance costs what an Entrance costs, each Intercom what an
        Intercom costs. Nothing records *which* Intercom belongs to *which* Entrance
        either: only the totals are compared, because the user places them freely and an
        Entrance with no Intercom on it is perfectly legitimate.

        Counting is **raw placements on both sides**. Unlike `validate_bundle_amenities`
        just above, rows ticked `additional_amenity` are deliberately *not* subtracted: a
        bundle-overflow Intercom is still a physical intercom that needs an entrance, and
        an overflow Entrance still supplies one.

        Warn during `validate`, governed by Butler Settings →
        action_if_dependencies_missing (+ override role) at `before_submit`.
        """
        # One row per placement, and annex rows are part of their amenity, not placements
        # of their own — expand_amenity_rows has already appended them by the time this
        # runs, so without the guard a dependant with 4 annexes would count as 5.
        counts = {}
        for row in self.amenities:
            if row.annex or not row.amenity:
                continue
            counts[row.amenity] = counts.get(row.amenity, 0) + 1
        if not counts:
            return

        # Resolve the flag from the Amenity itself, not row.is_dependant_amenity, because
        # the row's copy is stale exactly when this runs. Frappe refreshes a fetch_from
        # field in _validate_links, but only `if self.is_new() or not
        # self.docstatus.is_submitted()` (base_document.set_fetch_from_value) — and `self`
        # there is the child row. submit() sets docstatus=1 and set_docstatus() propagates
        # it to the children *before* _validate_links runs, so on the submit pass the row
        # keeps whatever the last draft save fetched. Tick is_dependant_amenity on an
        # Amenity after a draft was saved and the row still says 0 at before_submit.
        #
        # The row's copy is not useless — it is the point-in-time record of what was true
        # when the quotation was sold. It is just the wrong source for "is this true now".
        #
        # No `disabled` filter: an amenity disabled after the quotation was drawn is still
        # on it and still governed.
        dependants = frappe.get_all(
            "Amenity",
            filters={"name": ("in", list(counts)), "is_dependant_amenity": 1},
            pluck="name",
        )
        if not dependants:
            return

        links = frappe.get_all(
            "Amenity Depends On",
            filters={
                "parenttype": "Amenity",
                "parentfield": "depends_on",
                "parent": ("in", dependants),
            },
            fields=["parent", "amenity"],
        )

        # One entry per breached (dependant, primary) pair — an amenity with two primaries
        # can be short of both, and the user needs to see both.
        shortfalls = []
        seen = set()
        for link in links:
            pair = (link.parent, link.amenity)
            if not link.amenity or pair in seen:
                continue  # a duplicate row on the master must not report twice
            seen.add(pair)
            placed = counts.get(link.parent, 0)
            capacity = counts.get(link.amenity, 0)
            if placed > capacity:
                shortfalls.append((link.parent, placed, link.amenity, capacity))
        if not shortfalls:
            return
        shortfalls.sort()

        def line(dependant, placed, primary, capacity):
            if capacity:
                return _("{0} &mdash; {1} placed, but only {2} {3}").format(
                    frappe.bold(dependant), placed, capacity, frappe.bold(primary))
            return _("{0} &mdash; {1} placed, but no {2} on this quotation").format(
                frappe.bold(dependant), placed, frappe.bold(primary))

        message = (
            _("Each of these amenities needs a primary amenity of its own:")
            + "<ul>" + "".join("<li>{0}</li>".format(line(*s)) for s in shortfalls) + "</ul>"
            + _("Draw the missing primary amenities, or remove the extra dependants.")
        )
        title = _("Dependencies not met")

        if not enforce:
            frappe.msgprint(message, title=title, indicator="orange")
            return

        apply_governance_action(
            frappe.db.get_single_value(
                "Butler Settings", "action_if_dependencies_missing") or "Stop",
            message=message,
            title=title,
            override_role=frappe.db.get_single_value(
                "Butler Settings", "role_to_override_dependency_stop_action"),
        )

    def validate_system_core(self, enforce):
        """A quotation must carry at least one amenity flagged `is_system_core`.

        The system core is what the rest of the quotation hangs off — a plan of rooms with
        no core is not a sellable installation. One is enough: this asks whether a core is
        present at all, not how many, and it never looks at quantities, floors or price.

        Warn during `validate`, governed at `before_submit` by Butler Settings →
        system_core_action (+ override role), exactly like the three checks around it.
        """
        amenities = {row.amenity for row in self.amenities if row.amenity and not row.annex}

        # An empty table is an empty draft, not a breach — warning on every save of a
        # quotation somebody has only just opened would be noise. At submit there is no
        # such excuse: a quotation with nothing on it has no system core either, and
        # `amenities` is not a required field, so nothing else would stop it.
        if not amenities and not enforce:
            return

        # Resolved from the Amenity master, never read off `row.is_system_core`: the row's
        # copy stops being refreshed once the row is marked submitted, which happens just
        # before this runs. See the longer note in `validate_dependencies` — same
        # mechanism, same reason. No `disabled` filter — an amenity disabled after the
        # quotation was drawn is still on it and still counts.
        if amenities and frappe.get_all(
            "Amenity",
            filters={"name": ("in", list(amenities)), "is_system_core": 1},
            limit=1,
        ):
            return

        message = _("This quotation has no system core. Add at least one amenity marked "
                    "{0}.").format(frappe.bold(_("Is System Core")))

        # Naming the eligible amenities turns the refusal into an instruction — without it
        # there is nothing on screen to say which amenity would satisfy the rule. Disabled
        # ones are left out: they cannot be placed, so suggesting them would not help.
        # Capped, because a catalogue may mark many.
        choices = frappe.get_all(
            "Amenity",
            filters={"is_system_core": 1, "disabled": 0},
            pluck="name",
            order_by="name asc",
            limit=7,
        )
        if choices:
            shown = choices[:6]
            message += "<br>" + _("Marked as system core: {0}").format(
                frappe.bold(", ".join(shown)) + ("…" if len(choices) > len(shown) else ""))
        else:
            message += "<br>" + _("No amenity is marked as system core yet.")

        title = _("System core missing")

        if not enforce:
            frappe.msgprint(message, title=title, indicator="orange")
            return

        apply_governance_action(
            frappe.db.get_single_value("Butler Settings", "system_core_action") or "Stop",
            message=message,
            title=title,
            override_role=frappe.db.get_single_value(
                "Butler Settings", "role_to_override_system_core_stop_action"),
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
        # Not a declared field (never persisted) — exists only so the borrowed
        # AccountsController.set_payment_schedule / validate_payment_schedule_amount can
        # read it via self.get("conversion_rate") for their amount- (rather than
        # percentage-) based payment-term branch.
        self.conversion_rate = conversion_rate

        amenity_count = 0
        items_total = 0.0
        deviations = []
        for amenity_row, annex_rows in self.group_amenity_rows()[0]:
            amenity = (
                frappe.get_cached_doc("Amenity", amenity_row.amenity)
                if amenity_row.amenity else None
            )
            # One row IS one drawn placement, so the quantity is definitionally 1. Pinned
            # here rather than trusted: calculate_totals runs before both
            # validate_bundle_amenities and calculate_additional_total, which count it.
            amenity_row.amenity_qty = 1.0
            # the rate that produced the prices currently on the row, kept before it moves
            previous_qtn_rate = flt(amenity_row.qtn_exchange_rate) or 1.0
            # Per-row rates, both derived from the exchange_rates table so a currency
            # never carries two different rates: amenity→company, and amenity→quotation
            # as the ratio of the two company rates.
            amenity_row.base_exchange_rate = flt(
                rate_map.get(amenity_row.amenity_currency, 1.0)) or 1.0
            amenity_row.qtn_exchange_rate = (
                flt(amenity_row.base_exchange_rate) / conversion_rate)
            qtn_rate = flt(amenity_row.qtn_exchange_rate) or 1.0

            # --- annexes: the amenity's price is composed from them ---
            # the rates are set inside price_annex_row, which needs to read the *previous*
            # ones before overwriting them
            annex_total = 0.0
            deviations_before = len(deviations)
            for annex_row in annex_rows:
                annex_total += self.price_annex_row(
                    annex_row, facility_type, deviations,
                    flt(amenity_row.base_exchange_rate), flt(amenity_row.qtn_exchange_rate),
                )

            # --- the per-amenity add-ons ---
            rates = (qtn_rate, previous_qtn_rate)
            light_amount = self.price_light_system(amenity_row, amenity, rates)
            sound_amount = self.price_sound_system(amenity_row, amenity, rates)
            floor_amount = self.price_floor_extra(amenity_row, amenity, rates)

            # Records a fact for the line editor's filter; it moves no money. An annex counts
            # when price_annex_row has just listed it as deviating from its Annex Price.
            amenity_row.quotation_price_changed = 1 if (
                len(deviations) > deviations_before
                or self.add_on_quotation_price_changed(amenity_row, qtn_rate)
            ) else 0

            # The price of this one placement, in the amenity's own currency — the figure
            # an additional-amenity overflow is charged at. With one row per placement
            # there is no per-unit/total distinction left to draw: the annexes belong to
            # this placement, and its add-ons are fitted to it once.
            amenity_row.amenity_price = (
                annex_total + light_amount + sound_amount + floor_amount)
            amenity_row.qtn_amenity_price = (
                flt(amenity_row.amenity_price) * flt(amenity_row.qtn_exchange_rate))
            amenity_row.qtn_amenity_amount = (
                flt(amenity_row.qtn_amenity_price) * flt(amenity_row.amenity_qty))

            amenity_count += flt(amenity_row.amenity_qty)
            items_total += flt(amenity_row.qtn_amenity_amount)
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
        self.set_total_in_words(company_currency)

    def price_annex_row(self, row, facility_type, deviations, base_rate, qtn_rate):
        """Resolve one annex row's price and amount, returning its amount in the
        amenity's currency (the unit the amenity price is composed in).

        The standard comes from the **Annex Price** matching (annex, amenity,
        facility_type), falling back to the facility-type-agnostic row.
        `qtn_annex_price` is its Quotation Price — the only one checked against a published
        standard (see enforce_annex_price), and the only one converted back into its
        amenity-currency tier.

        Deciding whether that Quotation Price is still following its standard or has been
        changed by the user is the subtle part. The test is against **what tracking would have written last time** —
        the current standard at the row's *previous* exchange rate — rather than against
        the standard at today's rate. Comparing at today's rate would misread every
        untouched row as changed the moment the quotation currency changed, and comparing
        against the stored price would lose a real change on the next save,
        since that price was itself derived from it.
        """
        from butler.butler.doctype.annex_price.annex_price import get_annex_price

        standard = get_annex_price(row.annex, row.amenity, facility_type) or {}
        row.annex_price_list = standard.get("name")
        row.annex_uom = row.annex_uom or standard.get("uom") or get_annex_default_uom(row.annex)
        row.annex_quantity = flt(row.annex_quantity)

        # UOM conversion is for the downstream stock qty only — the rate is already per
        # annex_uom, so the factor must never enter the money maths.
        row.annex_stock_uom, row.conversion_factor = get_annex_uom_conversion(
            row.annex, row.annex_uom)

        # the rate that produced the price currently on the row, before we move it on
        previous_qtn_rate = flt(row.qtn_exchange_rate) or qtn_rate
        row.base_exchange_rate, row.qtn_exchange_rate = base_rate, qtn_rate

        resolved = flt(standard.get("rate"))          # amenity currency, per annex_uom
        qtn_standard = resolved * qtn_rate

        if not row.qtn_annex_price or abs(
            flt(row.qtn_annex_price) - resolved * previous_qtn_rate
        ) <= 0.005:
            row.qtn_annex_price = qtn_standard        # still ours — re-derive it
        elif abs(flt(row.qtn_annex_price) - qtn_standard) > 0.005:
            deviations.append((row, qtn_standard))    # changed by the user — keep it

        # annex_price mirrors whatever price is in force, so amount = price x qty holds
        # whether its Quotation Price is at the standard or has been changed
        row.annex_price = flt(row.qtn_annex_price) / qtn_rate
        row.annex_amount = flt(row.annex_price) * flt(row.annex_quantity)
        row.qtn_annex_amount = flt(row.qtn_annex_price) * flt(row.annex_quantity)
        return flt(row.annex_amount)

    def track_add_on_price(self, row, qtn_field, previous_standard, standard, rates):
        """Settle an add-on's quotation-currency price against its standard.

        The same rule `price_annex_row` follows: while the stored price still equals what
        tracking wrote last time — the *previous* standard at the *previous* rate — it is
        re-derived, so switching to a light system that costs something else, or changing
        the quotation currency, actually moves the price. Once the user has typed their
        own figure it is left alone.

        Without this, the price stayed on whatever the first-chosen system cost and every
        later choice was silently mispriced.
        """
        qtn_rate, previous_qtn_rate = rates
        stored = flt(row.get(qtn_field))
        if not stored or abs(stored - flt(previous_standard) * previous_qtn_rate) <= 0.005:
            row.set(qtn_field, flt(standard) * qtn_rate)
        return flt(row.get(qtn_field))

    # (Quotation Price, its standard in amenity currency) for each priced add-on
    ADD_ON_QUOTATION_PRICES = (
        ("qtn_light_system_price", "light_system_price"),
        ("qtn_sound_system_price", "sound_system_price"),
        ("qtn_floor_price", "floor_price"),
    )

    def add_on_quotation_price_changed(self, row, qtn_rate):
        """Whether the user has changed any add-on's Quotation Price on this row: it no
        longer equals its standard at today's rate, the same test track_add_on_price uses
        to decide what to keep."""
        return any(
            abs(flt(row.get(qtn_field)) - flt(row.get(standard_field)) * qtn_rate) > 0.005
            for qtn_field, standard_field in self.ADD_ON_QUOTATION_PRICES
        )

    LIGHT_SIGN = {"Add": 1.0, "Subtract": -1.0}

    def default_light_system(self):
        """The Light System marked `is_default`, resolved once per document.

        Asked twice per placement — to fill a blank row, and to price the fill — so a
        fifty-room plan would otherwise make a hundred identical queries, on every save and
        every live recalc. `False` is the sentinel rather than `None`, so a site with no
        default is cached as an answer instead of being re-asked for each row.
        """
        cached = getattr(self, "_default_light_system", False)
        if cached is False:
            cached = frappe.db.get_value("Light System", {"is_default": 1}, "name")
            self._default_light_system = cached
        return cached

    def light_system_config(self, amenity, system):
        """What `system` costs on this amenity: its own row if it configures one, else the
        Light System master. Returns `(price, pricing_mode, used_lines or None)`.

        The precedence is the whole point of the feature — an amenity may state its own
        terms for a system, and anything it has not configured still has a price, so every
        system in the catalogue can be fitted to every amenity. `used_lines` comes back
        None from the master, which has no such field: how many lines a system takes is a
        property of the amenity, not of the system.
        """
        if not system:
            return 0.0, None, None
        row = next(
            (r for r in (amenity.light_systems if amenity else [])
             if r.system_name == system),
            None,
        )
        if row:
            return flt(row.price), row.pricing_mode, cint(row.used_lines)
        master = frappe.get_cached_value(
            "Light System", system, ["standard_price", "pricing_mode"], as_dict=True)
        if not master:
            return 0.0, None, None
        return flt(master.standard_price), master.pricing_mode, None

    def price_light_system(self, row, amenity, rates):
        """Price the amenity's lines: the selected system covers the lines it is configured
        for, and the default system fills whatever is left.

        Every line is always priced. If the amenity configures the selected system for 2 of
        its 6 lines, those 2 are charged at the amenity's rate for it and the other 4 at the
        default system's — each with its own Add/Subtract sign, so a DALI fitted on 2 lines
        can credit the line while the RELAY filling the other 4 adds to it.

        If the amenity does not configure the selected system at all, there is no line count
        to split on, so that system covers the whole amenity at its master price and there
        is no fill.

        Per line, never per placement: `amenity_qty` is applied once by the caller, on
        `qtn_amenity_amount`. Multiplying here as well would square it — invisible from the
        Facility Builder, which posts one row per placement at qty 1, and wrong everywhere
        else. `price_floor_extra` follows the same convention with `floor_qty`.

        Only the selected system's price is negotiable (`qtn_light_system_price`, settled by
        `track_add_on_price`). The fill is charged at standard: it is not what was chosen,
        it is what covers the remainder.
        """
        total_lines = cint(amenity.lines) if amenity else 0

        # A light system is fitted whether or not anyone chose one, so a blank row adopts
        # the default rather than being priced at nothing. Done here, not only in the
        # Facility Builder, so a row typed on the form or posted by the API is governed
        # too. Writing it back onto the row is deliberate: the quotation should say which
        # system was fitted, not leave it to be re-derived later from a default that may
        # since have changed.
        if not row.light_system:
            row.light_system = self.default_light_system()

        price, mode, used = self.light_system_config(amenity, row.light_system)

        if not row.light_system or not mode:
            row.light_system_price = row.light_system_amount = 0
            row.qtn_light_system_price = row.qtn_light_system_amount = 0
            row.used_lines = row.total_lines = 0
            row.light_system_pricing_mode = None
            self.clear_default_system_fill(row)
            return 0.0

        # `used is None` means the amenity does not configure this system — it covers every
        # line, and nothing is left for the fill.
        covered = total_lines if used is None else min(used, total_lines)

        row.total_lines = total_lines
        row.used_lines = covered
        row.light_system_pricing_mode = mode

        previous_standard = flt(row.light_system_price)
        row.light_system_price = price
        qtn_price = self.track_add_on_price(
            row, "qtn_light_system_price", previous_standard, row.light_system_price, rates)

        sign = self.LIGHT_SIGN.get(mode, 0.0)
        row.light_system_amount = sign * qtn_price * covered / (rates[0] or 1.0)
        row.qtn_light_system_amount = sign * qtn_price * covered

        return flt(row.light_system_amount) + self.price_default_system_fill(
            row, amenity, rates, total_lines - covered)

    def price_default_system_fill(self, row, amenity, rates, lines):
        """Charge the lines the selected system does not cover to the default Light System.

        `Light System.before_save` keeps exactly one default and re-elects one if the last
        is unticked, so a catalogue with any system in it has a default. A site with none
        leaves the fill unpriced rather than erroring — there is nothing to fill it with.
        """
        if lines <= 0:
            self.clear_default_system_fill(row)
            return 0.0

        default = self.default_light_system()
        price, mode, _used = self.light_system_config(amenity, default)
        if not default or not mode:
            self.clear_default_system_fill(row)
            return 0.0

        row.default_system = default
        row.default_system_lines = lines
        row.default_system_pricing_mode = mode
        row.default_system_price = price

        sign = self.LIGHT_SIGN.get(mode, 0.0)
        qtn_price = price * (rates[0] or 1.0)
        row.qtn_default_system_price = qtn_price
        row.default_system_amount = sign * price * lines
        row.qtn_default_system_amount = sign * qtn_price * lines
        return flt(row.default_system_amount)

    def clear_default_system_fill(self, row):
        row.default_system = row.default_system_pricing_mode = None
        row.default_system_lines = 0
        row.default_system_price = row.default_system_amount = 0
        row.qtn_default_system_price = row.qtn_default_system_amount = 0

    def price_sound_system(self, row, amenity, rates):
        """A flat sound-system price, charged only when the row opts in.

        Flat by design: unlike the light system there is nothing to choose and no mode, so
        `has_sound_system` is the only thing that distinguishes "not fitted" from "fitted".
        Every amenity can be fitted with one. The price is the Amenity's own
        `sound_system_price`, or — when that is 0 — Butler Settings'
        `sound_system_default_price`.

        The default is in **company** currency, and this row's standard is in the
        amenity's, so it is converted through `base_exchange_rate` (amenity → company),
        which calculate_totals has already set on the row.
        """
        if not (row.has_sound_system and amenity):
            row.sound_system_price = row.sound_system_amount = 0
            row.qtn_sound_system_price = row.qtn_sound_system_amount = 0
            return 0.0

        previous_standard = flt(row.sound_system_price)
        row.sound_system_price = flt(amenity.sound_system_price) or (
            self.default_sound_system_price() / (flt(row.base_exchange_rate) or 1.0))
        qtn_price = self.track_add_on_price(
            row, "qtn_sound_system_price", previous_standard, row.sound_system_price, rates)

        row.sound_system_amount = qtn_price / (rates[0] or 1.0)
        row.qtn_sound_system_amount = qtn_price
        return flt(row.sound_system_amount)

    def default_sound_system_price(self):
        """Butler Settings' default sound price (company currency), read once per document
        rather than once per row — the same reasoning as `default_light_system`."""
        cached = getattr(self, "_default_sound_system_price", None)
        if cached is None:
            cached = flt(frappe.db.get_single_value("Butler Settings", "sound_system_default_price"))
            self._default_sound_system_price = cached
        return cached

    def price_floor_extra(self, row, amenity, rates):
        """The Amenity's floor extra, charged once per distinct floor on the quotation.

        Additive, per `Amenity.floor_extra_price`'s own definition — "multiplied by the
        number of floors and **added** to the Amenity price". This replaces the old model
        where floor_count multiplied the whole line.
        """
        if not (amenity and amenity.depends_on_floor_count):
            row.floor_price = row.floor_amount = 0
            row.qtn_floor_price = row.qtn_floor_amount = 0
            row.floor_qty = 0
            return 0.0

        previous_standard = flt(row.floor_price)
        row.floor_price = flt(amenity.floor_extra_price)
        row.floor_qty = cint(self.floor_count)
        qtn_price = self.track_add_on_price(
            row, "qtn_floor_price", previous_standard, row.floor_price, rates)

        row.floor_amount = qtn_price / (rates[0] or 1.0) * flt(row.floor_qty)
        row.qtn_floor_amount = qtn_price * flt(row.floor_qty)
        return flt(row.floor_amount)

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
          • category IN bundle_items → the amount of each row ticked `additional_amenity`.

        Each ticked row is charged **at its own price**. The old rule took the first
        ticked row's unit price and multiplied it by the overflow count, which was a
        consequence of consolidation: N placements had collapsed into one row, so there
        was nothing per-placement to tick and one row had to stand in for all of them.
        It also mispriced — three extras of different amenities were all billed at the
        first one's rate. One row per placement makes the honest rule the simple one.

        Amenity rows only — an annex is priced into its amenity, never charged twice.
        The amenity's own price already carries the floor extra, so there is no separate
        floors multiplier here any more.
        """
        configured = {r.amenity_category: cint(r.amenity_count) for r in self.bundle_items}

        rows_by_cat = {}
        for row in self.amenities:
            if row.annex or not row.amenity:
                continue
            category = frappe.get_cached_value(
                "Amenity", row.amenity, "amenity_category")
            if category:
                rows_by_cat.setdefault(category, []).append(row)

        total = 0.0
        for category, rows in rows_by_cat.items():
            if category not in configured:
                # whole category is extra
                total += sum(flt(r.qtn_amenity_amount) for r in rows)
                continue
            # an untick\ed overflow is undesignated — validate_bundle_amenities reports it
            total += sum(flt(r.qtn_amenity_amount) for r in rows if r.additional_amenity)
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
        if self.order_type == "Bundle":
            # Bundle: flat bundle price + additional amenities beyond the composition.
            # bundle_price is the taxable base for the bundle itself; additional_total
            # covers every amenity beyond the configured bundle composition.
            gross_bundle = flt(self.bundle_price)
            gross_additional = flt(self.additional_total)
        else:
            # Amenities / Quotation: every amenity line contributes to the taxable base.
            # additional_total is always 0 for non-Bundle orders (cleared by
            # clear_additional_amenities in before_validate).
            gross_bundle = flt(self.total)
            gross_additional = 0.0

        gross = gross_bundle + gross_additional
        total_qty = cint(self.amenity_count)

        # Inclusive tax: back the tax portion out of the combined gross (one base, not
        # per-item — see _resolve_exclusive_gross) and share the reduction across bundle +
        # additional the same way the discount below is shared. A no-op (ratio 1.0) when
        # no row is inclusive, so this changes nothing for the common case.
        exclusive_gross = self._resolve_exclusive_gross(gross, total_qty)
        ratio = (exclusive_gross / gross) if gross else 1.0
        gross_bundle = flt(gross_bundle) * ratio
        gross_additional = flt(gross_additional) * ratio
        gross = exclusive_gross

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

    def _resolve_exclusive_gross(self, gross, total_qty):
        """Back the inclusive-tax portion out of `gross`, mirroring ERPNext's
        determine_exclusive_rate/get_current_tax_fraction — adapted to Butler's single
        combined base (no per-item table to adjust). A tax row with
        `included_in_print_rate` means `gross` already contains that tax; every row
        (inclusive or not) then computes its tax_amount off the backed-out exclusive
        base in _apply_taxes, the same way ERPNext taxes every item off its adjusted
        net_amount. Returns `gross` unchanged when no row is inclusive.
        """
        rows = self.get("taxes") or []
        if not any(cint(t.included_in_print_rate) for t in rows):
            return gross

        fractions, grand_fractions = [], []
        cumulated_fraction, flat_total = 0.0, 0.0
        for i, tax in enumerate(rows):
            fraction = 0.0
            if cint(tax.included_in_print_rate):
                rate = flt(tax.rate)
                if tax.charge_type == "On Net Total":
                    fraction = rate / 100.0
                elif tax.charge_type == "On Previous Row Amount":
                    idx = cint(tax.row_id) - 1
                    fraction = (rate / 100.0) * fractions[idx] if 0 <= idx < i else 0.0
                elif tax.charge_type == "On Previous Row Total":
                    idx = cint(tax.row_id) - 1
                    fraction = (rate / 100.0) * grand_fractions[idx] if 0 <= idx < i else 0.0
                elif tax.charge_type == "On Item Quantity":
                    flat_total += rate * flt(total_qty)
                # Actual can never be inclusive (validate_inclusive_tax blocks it) -> 0
            fractions.append(fraction)
            grand_fractions.append((grand_fractions[i - 1] if i > 0 else 1.0) + fraction)
            cumulated_fraction += fraction

        if not cumulated_fraction and not flat_total:
            return gross
        return (flt(gross) - flat_total) / (1 + cumulated_fraction)

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

        # The header discount is shared down proportionally: onto each amenity row, then
        # across that amenity's annex rows. The annex net_ figures are guidance only —
        # nothing is charged from them — which is why the split can stay this simple.
        share = (flt(self.net_total) / flt(self.total)) if flt(self.total) else 1.0

        for amenity_row, annex_rows in self.group_amenity_rows()[0]:
            amenity_row.qtn_amenity_net_price = flt(amenity_row.qtn_amenity_price) * share
            amenity_row.qtn_amenity_net_amount = flt(amenity_row.qtn_amenity_amount) * share

            # amenity-currency values convert straight to company currency via the
            # amenity's own rate; quotation-currency values via the document rate.
            amenity_rate = flt(amenity_row.base_exchange_rate) or 1.0
            amenity_row.base_amenity_price = flt(amenity_row.amenity_price) * amenity_rate
            amenity_row.base_amenity_net_price = flt(amenity_row.qtn_amenity_net_price) * rate
            amenity_row.base_amenity_amount = flt(amenity_row.qtn_amenity_amount) * rate
            amenity_row.base_amenity_net_amount = flt(amenity_row.qtn_amenity_net_amount) * rate

            for name in ("light_system", "default_system", "sound_system", "floor"):
                for suffix in ("price", "amount"):
                    self.mirror_to_company(amenity_row, f"{name}_{suffix}", amenity_rate, rate)

            for annex_row in annex_rows:
                annex_rate = flt(annex_row.base_exchange_rate) or 1.0
                annex_row.qtn_annex_net_price = flt(annex_row.qtn_annex_price) * share
                annex_row.qtn_annex_net_amount = flt(annex_row.qtn_annex_amount) * share
                annex_row.base_annex_price = flt(annex_row.annex_price) * annex_rate
                annex_row.base_annex_net_price = flt(annex_row.qtn_annex_net_price) * rate
                annex_row.base_annex_amount = flt(annex_row.qtn_annex_amount) * rate
                annex_row.base_annex_net_amount = flt(annex_row.qtn_annex_net_amount) * rate

    def mirror_to_company(self, row, fieldname, amenity_rate, document_rate):
        """Fill a component's `base_*` mirror from whichever tier is authoritative: the
        Quotation Price when there is one (the user may have changed it),
        otherwise the amenity-currency source."""
        qtn_value = flt(row.get(f"qtn_{fieldname}"))
        row.set(
            f"base_{fieldname}",
            qtn_value * document_rate if qtn_value
            else flt(row.get(fieldname)) * amenity_rate,
        )

    def set_total_in_words(self, company_currency):
        """Written-out grand total, off `rounded_total`/`base_rounded_total` (or the
        unrounded `grand_total`/`base_grand_total` when disable_rounded_total is set) —
        same trigger points as ERPNext's `set_total_in_words`. Uses Butler's own
        `format_currency_in_words` rather than ERPNext's `money_in_words` — see
        docs/quotation_pricing/reference.md for the comparison.
        """
        from butler.utils.currency import format_currency_in_words

        amount = flt(self.grand_total if self.disable_rounded_total else self.rounded_total)
        self.in_words = format_currency_in_words(abs(amount), self.currency) if self.currency else ""

        base_amount = flt(
            self.base_grand_total if self.disable_rounded_total else self.base_rounded_total)
        self.base_in_words = (
            format_currency_in_words(abs(base_amount), company_currency) if company_currency else ""
        )

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

    def enforce_annex_price(self, deviations, bundle_price_breach=None):
        """Govern annex prices that deviate from their Annex Price standard, per Butler
        Settings → maintain_annex_price_action (Warn → msgprint · Stop → throw, unless
        the user holds role_to_override_annex_price_stop_action, who is warned but
        allowed).

        The annex Quotation Price is the only one that carries a published standard, so
        it is the only one governed. `bundle_price_breach` rides along when
        a Bundle's flat price is discounted past its max_discount.
        """
        lines = [
            "<li>{0} &mdash; {1} (standard {2})</li>".format(
                frappe.bold(row.annex), fmt_money(row.qtn_annex_price), fmt_money(standard)
            )
            for row, standard in deviations
        ]
        if bundle_price_breach:
            lines.append(bundle_price_breach)
        if not lines:
            return

        msg = _("These prices don't keep the standard:") + "<ul>" + "".join(lines) + "</ul>"

        apply_governance_action(
            frappe.db.get_single_value(
                "Butler Settings", "maintain_annex_price_action") or "Stop",
            message=msg,
            title=_("Annex price not maintained"),
            override_role=frappe.db.get_single_value(
                "Butler Settings", "role_to_override_annex_price_stop_action"),
        )

    # --- light system devices: what the facility needs to buy -------------------------
    # Not pricing. Controllers are bought for the whole facility, not per amenity, so this
    # runs after calculate_totals and only READS the line split pricing settled on each
    # amenity row (light_system / used_lines, default_system / default_system_lines). It
    # writes no price, and nothing in calculate_totals reads what it writes.
    # See docs/light_system_devices.md.

    def set_light_system_devices(self):
        """Count the controller devices the whole facility needs, into `devices`.

        Lines are summed per (light system, device) across every amenity row, and each
        device covers `channels_count` of them, so `device_count = ceil(lines / channels)`.
        A row's selected system uses the row's own `light_system_device`; every line of
        the default system — rooms that chose it, and the fill on every other room — uses
        the one facility-wide default device, held on the table's `is_default` row.
        """
        amenity_rows = [row for row, _annexes in self.group_amenity_rows()[0]]
        catalogue = self.light_system_devices()
        default = self.default_light_system()
        self.resolve_row_devices(amenity_rows, catalogue, default)
        default_device = self.resolve_default_device(catalogue, default)

        self.total_lines = sum(cint(row.total_lines) for row in amenity_rows)

        lines = {}  # (system, device) -> lines, in order of first appearance

        def serve(system, device, count):
            if system and device and cint(count) > 0:
                lines[(system, device)] = lines.get((system, device), 0) + cint(count)

        for row in amenity_rows:
            if row.light_system == default:
                serve(default, default_device, row.used_lines)
            else:
                serve(row.light_system, row.light_system_device, row.used_lines)
            serve(row.default_system, default_device, row.default_system_lines)

        details = {}
        if lines:
            details = {
                d.name: d for d in frappe.get_all(
                    "Light System Device",
                    filters={"name": ["in", list({device for _s, device in lines})]},
                    fields=["name", "manufacturer", "warranty", "warranty_uom"],
                )
            }

        rows = []
        # the default system's device first; the rest keep their order of first appearance
        for (system, device), count in sorted(lines.items(), key=lambda kv: kv[0][0] != default):
            channels = catalogue[system]["channels"].get(device, 0)
            detail = details.get(device) or {}
            rows.append({
                "light_system": system,
                "device": device,
                "used_lines": count,
                "channels_count": channels,
                "device_count": math.ceil(count / channels) if channels else 0,
                "is_default": 1 if system == default else 0,
                # set here, not left to fetch_from, which a no-save recalc never runs
                "manufacturer": detail.get("manufacturer"),
                "warranty": detail.get("warranty"),
                "warranty_uom": detail.get("warranty_uom"),
            })
        self.set("devices", rows)

    def light_system_devices(self):
        """Every Light System's devices, resolved once per document:
        `{system: {"channels": {device: channels_count}, "default": device}}`.

        `default` is the row ticked `is_default`, else the first row — the same rule
        `LightSystem.validate_devices` enforces, repeated so data saved before it existed
        still resolves.
        """
        cached = getattr(self, "_light_system_devices", None)
        if cached is None:
            cached = {}
            for row in frappe.get_all(
                "Light System Device Item",
                filters={"parenttype": "Light System", "parentfield": "devices"},
                fields=["parent", "device", "channels_count", "is_default"],
                order_by="idx asc",
            ):
                entry = cached.setdefault(row.parent, {"channels": {}, "default": None})
                entry["channels"].setdefault(row.device, cint(row.channels_count))
                if row.is_default and not entry["default"]:
                    entry["default"] = row.device
            for entry in cached.values():
                entry["default"] = entry["default"] or next(iter(entry["channels"]), None)
            self._light_system_devices = cached
        return cached

    def resolve_row_devices(self, amenity_rows, catalogue, default):
        """Settle each amenity row's `light_system_device`, the device that serves it.

        A row on the default system carries none — the facility-wide default device serves
        it. Any other row takes the device **picked** for its room in the Facility Builder
        (stored in `geometry`, see device_picks) while that device is still configured on its
        system, and otherwise its system's **current** default device. So a room nobody
        picked a device for follows its Light System: change the default there, and the next
        save or "Reset Amenity" moves it. Rows with no drawing behind them (form,
        API, import) follow the default too.
        """
        picks = self.device_picks()["rooms"]
        for row in amenity_rows:
            entry = catalogue.get(row.light_system)
            if not entry or row.light_system == default:
                row.light_system_device = None
                continue
            picked = picks.get(row.placement_id)
            row.light_system_device = picked if picked in entry["channels"] else entry["default"]

    def resolve_default_device(self, catalogue, default):
        """The device serving every line of the default Light System: the one picked in the
        Facility Builder toolbar (stored in `geometry`) while it is configured on the default
        system, otherwise that system's current default device."""
        entry = catalogue.get(default) if default else None
        if not entry:
            return None
        picked = self.device_picks()["facility"]
        return picked if picked in entry["channels"] else entry["default"]

    def device_picks(self):
        """The devices someone deliberately picked, read from `geometry` — the only place they
        are kept: `room.light_system_device` per room, and the envelope's
        `default_light_system_device` for the whole facility. Absent means "follow the Light
        System's default"; the Facility Builder only stores a device that differs from it."""
        geometry = parse_geometry(self.geometry)
        return {
            "facility": geometry.get("default_light_system_device"),
            "rooms": {
                room.get("id"): room.get("light_system_device")
                for floor in geometry.get("floors") or []
                for room in floor.get("rooms") or []
                if room.get("id") and room.get("light_system_device")
            },
        }


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
def get_amenity_options(amenities):
    """What each amenity offers, so the line editor knows which controls to render.

    Every amenity offers a light system and a sound system (a 0 sound price falls back to
    Butler Settings' default); only the floor extra depends on the amenity being
    floor-dependent. The light-system rows and line count also feed the editor's hints —
    the quotation row can't answer that on its own once the fields are blank. Batched to
    one round trip because the editor needs it for every amenity on the quotation.
    """
    if isinstance(amenities, str):
        amenities = frappe.parse_json(amenities)

    options = {}
    for name in set(amenities or []):
        if not name:
            continue
        amenity = frappe.get_cached_doc("Amenity", name)
        options[name] = {
            "currency": amenity.currency,
            # the line editor's amenity headings show it; read here so an image attached to
            # the Amenity later shows at once, not only after the quotation is re-saved
            "image": amenity.image,
            # the line editor's Butler Manager filter; read here so a manager set on the
            # Amenity counts at once, before any refresh of the quotation's own copy
            "butler_manager": amenity.butler_manager,
            "lines": cint(amenity.lines),
            "depends_on_floor_count": cint(amenity.depends_on_floor_count),
            "floor_extra_price": flt(amenity.floor_extra_price),
            "sound_system_price": flt(amenity.sound_system_price),
            "light_systems": [
                {
                    "system_name": row.system_name,
                    "used_lines": cint(row.used_lines),
                    "price": flt(row.price),
                    "pricing_mode": row.pricing_mode,
                }
                for row in amenity.light_systems
            ],
            "annexes": [
                {"annex": row.annex, "qty": flt(row.qty), "uom": row.uom}
                for row in amenity.annexes
            ],
        }
    return options


@frappe.whitelist()
def get_amenity_pricing(amenity, facility_type=None):
    """An amenity's standard price for a facility type, composed from its annexes.

    There is no flat amenity price any more: the price is the sum of the amenity's annex
    rows, each valued at the **Annex Price** that applies to the facility type (falling
    back to the standard one), so a facility-type override on any single annex moves the
    amenity's price. Returned **in the amenity's own currency**; the quotation converts.

    Add-ons (light system, sound system, floor extra) are deliberately excluded — they
    depend on per-row choices the quotation makes, not on the amenity alone.
    """
    from butler.butler.doctype.annex_price.annex_price import get_annex_price

    if not amenity:
        return {"amenity_price": 0.0, "depends_on_floor_count": 0, "currency": None}

    am = frappe.get_cached_doc("Amenity", amenity)
    price = 0.0
    for row in am.annexes:
        standard = get_annex_price(row.annex, amenity, facility_type)
        rate = flt(standard["rate"]) if standard else flt(row.rate)
        price += rate * flt(row.qty)

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
def get_party_details(party_name, quotation_to, company=None):
    """Fetch a Butler Quotation's party details, mirroring ERPNext's
    `erpnext.accounts.party.get_party_details` for the subset Butler needs:
    the party's display name, its default billing Address (+ rendered display),
    its default Contact (+ display / mobile / email), and its default Payment Terms
    Template (Customer/Customer Group -> Company fallback — reusing the exact same
    ERPNext function the real get_party_details calls, so a Lead correctly resolves to
    no template, matching ERPNext's own Quotation-to-Lead behaviour).

    Called from the form's `party_name` trigger; the company address is resolved
    separately on the `company` trigger, exactly like ERPNext.
    """
    from erpnext.accounts.party import get_payment_terms_template
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

    out.payment_terms_template = get_payment_terms_template(party_name, quotation_to, company)

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
    """Map a Butler Quotation to a Sales Order.

    Amenities: each amenity row → Sales Order Item via amenity.amenity_item (partial
    ordering supported — only the not-yet-ordered balance is mapped).

    Bundle: single Sales Order Item via butler_bundle.bundle_item at bundle_price.
    """
    source = frappe.get_doc("Butler Quotation", source_name)

    if source.order_type not in ("Amenities", "Bundle"):
        frappe.throw(_("Creating a Sales Order is supported only for Amenities and Bundle quotations."))

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

    doc_conversion_rate = next(
        (flt(r.conversion_rate) for r in source.exchange_rates
         if r.currency == source.currency), 1.0)

    def set_missing_values(src, target):
        if customer:
            target.customer = customer.name
            target.customer_name = customer.customer_name
        if source.currency:
            target.currency = source.currency
        target.ignore_pricing_rule = 1
        target.flags.ignore_permissions = ignore_permissions
        target.run_method("set_missing_values")
        if doc_conversion_rate:
            target.conversion_rate = doc_conversion_rate

        if source.order_type == "Bundle":
            bundle_item_code = frappe.db.get_value("Butler Bundle", source.bundle_type, "bundle_item")
            if not bundle_item_code:
                frappe.throw(
                    _("Bundle {0} has no linked Item, so it can't be added to a Sales Order.").format(
                        frappe.bold(source.bundle_type)
                    )
                )
            # 1. Flat bundle price as a single line
            target.append("items", {
                "item_code": bundle_item_code,
                "qty": 1,
                "rate": source.bundle_price,
                "butler_quotation": source.name,
            })

            # 2. Additional amenity lines — mirrors calculate_additional_total exactly:
            #    • category NOT in bundle_items → every row charged (auto-additional)
            #    • category IN bundle_items → every row ticked additional_amenity
            # Both branches now map one SO line per quotation row, so `sum(these lines)`
            # equals `additional_total` by construction. Keep the two in lockstep.
            configured = {r.amenity_category: cint(r.amenity_count) for r in source.bundle_items}

            rows_by_cat = {}
            for row in source.amenities:
                # annex rows are priced into their amenity and carry no amenity_qty or
                # price of their own — mapping them appended SO lines with a null qty
                if row.annex or not row.amenity:
                    continue
                category = frappe.get_cached_value("Amenity", row.amenity, "amenity_category")
                if category:
                    rows_by_cat.setdefault(category, []).append(row)

            for category, rows in rows_by_cat.items():
                charged = rows if category not in configured else [
                    r for r in rows if r.additional_amenity
                ]
                for row in charged:
                    target.append("items", {
                        "item_code": get_amenity_item(row.amenity),
                        "qty": row.amenity_qty,
                        "rate": row.qtn_amenity_price,
                        "butler_quotation": source.name,
                        "butler_quotation_item": row.name,
                    })

        target.run_method("calculate_taxes_and_totals")

    def update_item(obj, target, source_parent):
        target.item_code = get_amenity_item(obj.amenity)
        balance_qty = flt(obj.amenity_qty) - flt(ordered_items.get(obj.name, 0))
        target.qty = balance_qty if balance_qty > 0 else 0
        # the amenity's unit price already contains its annexes and add-ons
        target.rate = obj.qtn_amenity_price

    def can_map_row(obj):
        # annex rows are quotation-only detail — they are priced into their amenity
        if obj.annex:
            return False
        return flt(obj.amenity_qty) > flt(ordered_items.get(obj.name, 0))

    child_table_map = {}
    if source.order_type == "Amenities":
        child_table_map["Butler Quotation Item"] = {
            "doctype": "Sales Order Item",
            "field_map": {"parent": "butler_quotation", "name": "butler_quotation_item"},
            "postprocess": update_item,
            "condition": can_map_row,
        }

    doclist = get_mapped_doc(
        "Butler Quotation",
        source_name,
        {
            "Butler Quotation": {
                "doctype": "Sales Order",
                "validation": {"docstatus": ["=", 1]},
                # the Sales Order gets its OWN payment schedule (below), mirroring
                # ERPNext's Quotation -> Sales Order mapping
                "field_no_map": ["payment_terms_template"],
            },
            **child_table_map,
            # Carry the tax rows (account_head, rate, charge_type, row_id) so the SO
            # uses the same tax structure as the quotation. reset_value=True lets the
            # SO's calculate_taxes_and_totals recompute amounts on its own items —
            # which sum to the same net base, so tax amounts reconcile exactly.
            # Mirrors ERPNext's Quotation → Sales Order mapping.
            "Sales Taxes and Charges": {
                "doctype": "Sales Taxes and Charges",
                "reset_value": True,
            },
        },
        target_doc,
        set_missing_values,
        ignore_permissions=ignore_permissions,
    )

    # Mirrors ERPNext's Quotation._make_sales_order: pre-populate the newly mapped (still
    # unsaved) Sales Order's own payment schedule immediately, the same one its own
    # AccountsController.validate() would compute on save anyway (100% due immediately,
    # or from its own payment_terms_template) -- so the freshly opened form shows it
    # right away instead of only after the user saves.
    if cint(frappe.get_single_value("Accounts Settings", "automatically_fetch_payment_terms")):
        doclist.set_payment_schedule()

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


# --- the Facility layout: quotation rows from the drawing ---------------------------------
# `geometry` is the source of truth for what is placed where (docs/facility_builder/
# data-model.md); the `amenities` table is its projection. These helpers rebuild that
# projection on the server, exactly as a Facility Builder save does in the browser, for the
# one-time conversion of quotations made before the current row model (docs/legacy_quotations.md).

# Amenities renamed after quotations were drawn. Frappe's rename updates every Link field,
# so the rows already carry the new name, but not names stored inside the `geometry` JSON.
# Each entry is backed by the rows: the quotations drawing "Pool" hold "Pool Indoor" rows.
LEGACY_AMENITY_RENAMES = {"pool": "Pool Indoor"}

# What "Reset Amenity → Details" re-copies: descriptive fields only. Left out on purpose:
# `lines`, `amenity_currency` and `depends_on_floor_count`, which move prices and are
# refreshed by an ordinary save together with the repricing; and the fetch_if_empty fields
# (`alias`, descriptions), which may hold what the user typed.
REFRESH_FROM_AMENITY = ("butler_manager", "image", "amenity_category", "is_system_core", "is_dependant_amenity")
REFRESH_FROM_ANNEX = ("annex_name", "annex_category", "manufacturer", "warranty", "warranty_uom", "annex_icon")


def parse_geometry(geometry):
    if isinstance(geometry, dict):
        return geometry
    try:
        return json.loads(geometry) if geometry else {}
    except ValueError:
        return {}


def resolve_drawn_amenity(name, catalogue):
    """The Amenity a drawn room names: the exact name, else the same name ignoring case
    (rooms drawn before an Amenity's name was re-cased), else a recorded rename.
    `catalogue` maps lower-cased Amenity names to their names. None when nothing matches."""
    if not name:
        return None
    return catalogue.get(name.lower()) or LEGACY_AMENITY_RENAMES.get(name.lower())


def normalise_geometry(geometry):
    """Point every drawn room at an Amenity that exists. Returns the geometry and the names
    that could not be resolved (empty when all were)."""
    catalogue = {name.lower(): name for name in frappe.get_all("Amenity", pluck="name")}
    unresolved = set()
    for floor in geometry.get("floors") or []:
        for room in floor.get("rooms") or []:
            if not room.get("amenity"):
                continue
            resolved = resolve_drawn_amenity(room["amenity"], catalogue)
            if resolved:
                room["amenity"] = resolved
            else:
                unresolved.add(room["amenity"])
    return geometry, sorted(unresolved)


def rows_from_geometry(geometry):
    """One amenity row per drawn room, as the Facility Builder's build_amenity_rows sends
    them (public/js/facility_builder/store.js). A room whose annexes were edited brings its
    own annex rows; any other room is left without, so expand_amenity_rows seeds it from its
    Amenity on save, exactly as after a builder save."""
    rows = []
    for floor in geometry.get("floors") or []:
        for room in floor.get("rooms") or []:
            if not room.get("amenity"):
                continue
            customised = isinstance(room.get("annexes"), list)
            alias = room.get("alias")
            rows.append({
                "doctype": "Butler Quotation Item",
                "placement_id": room.get("id"),
                "amenity": room["amenity"],
                "floor_type": floor.get("floor_type"),
                "amenity_qty": 1,
                "alias": alias if (alias or "").strip() else None,
                "light_system": room.get("light_system") or None,
                "light_system_device": room.get("light_system_device") or None,
                "has_sound_system": 1 if room.get("has_sound_system") else 0,
                "annexes_customised": 1 if customised else 0,
            })
            for annex in (room["annexes"] if customised else []):
                rows.append({
                    "doctype": "Butler Quotation Item",
                    "placement_id": room.get("id"),
                    "amenity": room["amenity"],
                    "floor_type": floor.get("floor_type"),
                    "annex": annex.get("annex"),
                    "annex_quantity": flt(annex.get("qty")) or 1,
                    "annex_uom": annex.get("uom"),
                })
    return rows


def legacy_rows(name):
    """The rows of a quotation made before the current row model, read straight from the
    table: their quantity and price live in columns the doctype no longer defines."""
    columns = set(frappe.db.get_table_columns("Butler Quotation Item"))
    if not {"qty", "rate", "amount"} <= columns:
        return []
    return frappe.db.sql(
        """select amenity, floor_type, qty, rate, amount from `tabButler Quotation Item`
        where parent = %s and parenttype = 'Butler Quotation' and ifnull(annex, '') = ''
        order by idx""",
        name, as_dict=True,
    )


def is_legacy_quotation(name):
    """Made before placements: it has amenity rows, and none carries a placement id."""
    return bool(frappe.db.sql(
        """select 1 from `tabButler Quotation Item` where parent = %s
        and parenttype = 'Butler Quotation' and ifnull(annex, '') = '' limit 1""", name
    )) and not frappe.db.exists(
        "Butler Quotation Item",
        {"parent": name, "parenttype": "Butler Quotation", "placement_id": ["is", "set"]},
    )


def convert_legacy_quotation(name):
    """Rebuild a pre-placement quotation from its Facility drawing: one row per drawn room,
    annexes from each Amenity, priced at today's standards, devices counted — and a timeline
    record of what it was before. Used once, by the convert_legacy_quotations patch."""
    doc = frappe.get_doc("Butler Quotation", name)
    if doc.docstatus != 0:
        frappe.throw(_("{0} is not a draft.").format(name))
    geometry = parse_geometry(doc.geometry)
    if not geometry.get("floors"):
        frappe.throw(_("{0} has no Facility layout to rebuild from.").format(name))

    geometry, unresolved = normalise_geometry(geometry)
    if unresolved:
        frappe.throw(_("{0}: these drawn amenities don't exist: {1}").format(
            name, ", ".join(unresolved)))

    old_total = flt(doc.grand_total)
    old_rows = legacy_rows(name)  # read before the save replaces them

    doc.geometry = json.dumps(geometry)
    doc.set("amenities", rows_from_geometry(geometry))
    doc.save(ignore_permissions=True)

    rooms = sum(1 for row in doc.amenities if not row.annex)
    devices = [(d.device, cint(d.device_count)) for d in doc.devices]
    doc.add_comment("Comment", conversion_record(doc, old_total, old_rows, rooms, devices))
    return {"old_total": old_total, "new_total": flt(doc.grand_total), "rooms": rooms,
            "annex_rows": sum(1 for row in doc.amenities if row.annex), "devices": devices}


def amenities_behind_their_amenity(doc):
    """The non-customised amenities whose annex rows no longer match their Amenity's list,
    as placement ids, plus whether any row links an Annex Price that no longer exists."""
    groups, _orphans = doc.group_amenity_rows()
    behind = [
        row.placement_id for row, annex_rows in groups
        if row.amenity and not cint(row.annexes_customised)
        and not matches_composition(annex_rows, frappe.get_cached_doc("Amenity", row.amenity).annexes)
    ]
    linked = {r.annex_price_list for r in doc.amenities if r.annex_price_list}
    stale_links = bool(linked) and len(linked) != frappe.db.count("Annex Price", {"name": ["in", list(linked)]})
    return behind, stale_links


def sync_with_amenities(name):
    """Bring a draft in line with its Amenities' current annex lists, once, with a record.
    Used by the sync_quotations_with_amenities patch. Returns None when it already matches.

    The save does the work: expand_amenity_rows re-seeds every non-customised amenity that
    differs from its Amenity, and stale Annex Price links are cleared. The timeline note
    explains the total that moves with it."""
    doc = frappe.get_doc("Butler Quotation", name)
    if doc.docstatus != 0:
        return None
    behind, stale_links = amenities_behind_their_amenity(doc)
    if not behind and not stale_links:
        return None

    old_total = flt(doc.grand_total)
    doc.flags.ignore_price_governance = True
    doc.save(ignore_permissions=True)
    doc.add_comment("Comment", "<p>{0}</p><p>{1}</p>".format(
        _("Synced with the Amenities' current annex lists: {0} amenities updated.").format(len(behind)),
        _("Grand Total: {0} → {1}").format(
            fmt_money(old_total, currency=doc.currency), fmt_money(doc.grand_total, currency=doc.currency)),
    ))
    return {"amenities": len(behind), "old_total": old_total, "new_total": flt(doc.grand_total)}


def conversion_record(doc, old_total, old_rows, rooms, devices):
    """The timeline note left on a converted quotation, so its old figures stay readable."""
    currency = doc.currency
    lines = "".join(
        "<tr><td>{0}</td><td>{1}</td><td style='text-align:right'>{2}</td>"
        "<td style='text-align:right'>{3}</td><td style='text-align:right'>{4}</td></tr>".format(
            frappe.utils.escape_html(r.amenity or ""), frappe.utils.escape_html(r.floor_type or ""),
            cint(r.qty), fmt_money(r.rate, currency=currency), fmt_money(r.amount, currency=currency))
        for r in old_rows
    )
    table = (
        "<table class='table table-bordered table-sm'><thead><tr><th>{0}</th><th>{1}</th>"
        "<th>{2}</th><th>{3}</th><th>{4}</th></tr></thead><tbody>{5}</tbody></table>".format(
            _("Amenity"), _("Floor"), _("Qty"), _("Rate"), _("Amount"), lines)
        if old_rows else ""
    )
    device_text = ", ".join(f"{frappe.utils.escape_html(d)} × {n}" for d, n in devices) or _("none")
    return "<p>{0}</p><p>{1}</p><p>{2}</p>{3}".format(
        _("Converted to the current layout: one row per drawn amenity, annexes from each Amenity, "
          "priced at today's standards."),
        _("Grand Total: {0} → {1} · {2} amenities").format(
            fmt_money(old_total, currency=currency), fmt_money(doc.grand_total, currency=currency), rooms),
        _("Light system devices: {0}").format(device_text),
        ("<p>" + _("The rows before the conversion:") + "</p>" + table) if table else "",
    )


RESET_OPTIONS = ("details", "prices", "annexes", "light_sound")
# Options that change what is priced, so the quotation is saved and recalculated.
RESET_SAVES = {"prices", "annexes", "light_sound"}


@frappe.whitelist()
def reset_amenities(name, options, amenities=None, placements=None):
    """"Reset Amenity": put chosen rooms back to their masters.

    Scope: every room, the rooms of the given `amenities`, or the given `placements`.
    Options (any of RESET_OPTIONS):

    - details      descriptive fields re-copied from the Amenity / Annex (no repricing)
    - prices       every Quotation Price of the room back to its standard
    - annexes      the room's annexes back to the Amenity's own list (Facility Builder
                   edits undone)
    - light_sound  the default light system, sound off, no device pick

    Annexes, light & sound and device picks also live in the Facility Builder drawing, so
    they are reset there too — otherwise the next builder save would bring them back.
    Devices are always recounted. A reset that reprices is saved and leaves a timeline
    record of the old and new totals. See docs/legacy_quotations.md.
    """
    options = set(frappe.parse_json(options) if isinstance(options, str) else options or [])
    amenities = frappe.parse_json(amenities) if isinstance(amenities, str) else amenities
    placements = frappe.parse_json(placements) if isinstance(placements, str) else placements
    if not options or not options <= set(RESET_OPTIONS):
        frappe.throw(_("Choose what to reset: details, prices, annexes or light & sound."))

    doc = frappe.get_doc("Butler Quotation", name)
    doc.check_permission("write")
    if doc.docstatus != 0:
        frappe.throw(_("Only a draft quotation can be reset."))

    rooms = [row for row in doc.amenities if not row.annex]
    if placements is not None:
        targets = {r.placement_id for r in rooms if r.placement_id in set(placements)}
    elif amenities is not None:
        targets = {r.placement_id for r in rooms if r.amenity in set(amenities)}
    else:
        targets = {r.placement_id for r in rooms}
    if (placements is not None or amenities is not None) and not (placements or amenities):
        frappe.throw(_("Select the amenity types or amenities to reset."))
    whole_quotation = placements is None and amenities is None

    old_total = flt(doc.grand_total)
    result = {"rooms": len(targets), "options": sorted(options), "old_total": old_total,
              "new_total": old_total, "rows_updated": 0, "picks_cleared": 0}
    if not targets:
        result["devices"] = [(d.device, cint(d.device_count)) for d in doc.devices]
        return result

    if not options & RESET_SAVES:
        result.update(refresh_details(doc, targets))
        result["new_total"] = flt(frappe.db.get_value("Butler Quotation", doc.name, "grand_total"))
        return result

    default = doc.default_light_system()
    geometry = parse_geometry(doc.geometry)
    drawn = {room.get("id"): room for floor in geometry.get("floors") or []
             for room in floor.get("rooms") or [] if room.get("id")}

    if "annexes" in options:
        for row in list(doc.amenities):
            if row.annex and row.placement_id in targets:
                doc.remove(row)
        for row in rooms:
            if row.placement_id in targets:
                row.annexes_customised = 0
                drawn.get(row.placement_id, {}).pop("annexes", None)

    if "light_sound" in options:
        for row in rooms:
            if row.placement_id not in targets:
                continue
            row.light_system, row.has_sound_system, row.light_system_device = default, 0, None
            room = drawn.get(row.placement_id)
            if room is not None:
                room["light_system"], room["has_sound_system"] = default, 0
                room.pop("light_system_device", None)
        if whole_quotation:
            geometry.pop("default_light_system_device", None)

    if "prices" in options:
        for row in doc.amenities:
            if row.placement_id not in targets:
                continue
            if row.annex:
                row.qtn_annex_price = 0
            else:
                row.qtn_light_system_price = row.qtn_sound_system_price = row.qtn_floor_price = 0
        # otherwise carry_forward_overrides would copy the old prices back onto the blanks
        doc.flags.reset_prices = targets

    doc.geometry = json.dumps(geometry)
    result["picks_cleared"] = prune_device_picks(doc)
    doc.save()

    result["new_total"] = flt(doc.grand_total)
    result["devices"] = [(d.device, cint(d.device_count)) for d in doc.devices]
    doc.add_comment("Comment", reset_record(doc, options, targets, rooms, whole_quotation, old_total))
    return result


def reset_record(doc, options, targets, rooms, whole_quotation, old_total):
    """The timeline note left by a reset that repriced the quotation."""
    labels = {"details": _("Details"), "prices": _("Prices"), "annexes": _("Annexes"),
              "light_sound": _("Light & sound")}
    if whole_quotation:
        scope = _("all amenities")
    else:
        names = sorted({r.amenity for r in rooms if r.placement_id in targets})
        scope = ", ".join(frappe.utils.escape_html(n) for n in names)
    return "<p>{0}</p><p>{1}</p>".format(
        _("Reset Amenity: {0} for {1} ({2} amenities).").format(
            ", ".join(labels[o] for o in RESET_OPTIONS if o in options), scope, len(targets)),
        _("Grand Total: {0} → {1}").format(
            fmt_money(old_total, currency=doc.currency), fmt_money(doc.grand_total, currency=doc.currency)),
    )


def refresh_details(doc, targets):
    """Details only: re-copy the descriptive fields of the target rooms from their Amenity
    and Annex, and recount the devices — without saving or repricing. Composition, prices
    and light systems are left alone."""
    meta = frappe.get_meta("Butler Quotation Item")
    source_field = {f: meta.get_field(f).fetch_from.split(".", 1)[1]
                    for f in REFRESH_FROM_AMENITY + REFRESH_FROM_ANNEX}

    def blank(value):
        return None if value in (None, "", 0) else value

    rows_updated = 0
    for row in doc.amenities:
        if row.placement_id not in targets:
            continue
        sources = [("Amenity", row.amenity, REFRESH_FROM_AMENITY)]
        if row.annex:
            sources.append(("Annex", row.annex, REFRESH_FROM_ANNEX))
        changes = {}
        for doctype, link, fields in sources:
            if not link:
                continue
            values = frappe.get_cached_value(
                doctype, link, [source_field[f] for f in fields], as_dict=True) or {}
            for f in fields:
                if blank(row.get(f)) != blank(values.get(source_field[f])):
                    changes[f] = values.get(source_field[f])
        if changes:
            row.db_set(changes, update_modified=False)
            rows_updated += 1

    # The device count reads the light-system split pricing already stored on each row,
    # so it is recounted here without repricing (docs/light_system_devices.md).
    stored_devices = {row.name: row.light_system_device for row in doc.amenities if not row.annex}
    doc.set_light_system_devices()
    for row in doc.amenities:
        if not row.annex and row.light_system_device != stored_devices.get(row.name):
            row.db_set("light_system_device", row.light_system_device, update_modified=False)
    pruned = prune_device_picks(doc)
    if pruned:
        doc.db_set("geometry", doc.geometry, update_modified=False)
    frappe.db.delete("Quotation Light System Item",
                     {"parent": doc.name, "parenttype": doc.doctype, "parentfield": "devices"})
    for idx, device in enumerate(doc.devices, start=1):
        device.update({"parent": doc.name, "parenttype": doc.doctype, "parentfield": "devices", "idx": idx})
        device.db_insert()
    # one write that also moves `modified`, so an open form knows to reload
    frappe.db.set_value("Butler Quotation", doc.name, "total_lines", doc.total_lines)

    return {"rows_updated": rows_updated, "picks_cleared": pruned,
            "devices": [(d.device, cint(d.device_count)) for d in doc.devices]}


def prune_device_picks(doc):
    """Clear device picks in `geometry` that no longer apply — a device since removed from
    its Light System, or a pick on a room now on the default system — so the drawing says
    what the quotation counts and a later Facility Builder save can't bring an old device
    back. Returns how many picks were cleared; updates `doc.geometry` in memory."""
    geometry = parse_geometry(doc.geometry)
    catalogue = doc.light_system_devices()
    default = doc.default_light_system()
    cleared = 0

    facility_pick = geometry.get("default_light_system_device")
    if facility_pick and facility_pick not in (catalogue.get(default) or {}).get("channels", {}):
        geometry.pop("default_light_system_device", None)
        cleared += 1

    for floor in geometry.get("floors") or []:
        for room in floor.get("rooms") or []:
            picked = room.get("light_system_device")
            if not picked:
                continue
            system = room.get("light_system") or default
            if system == default or picked not in (catalogue.get(system) or {}).get("channels", {}):
                room.pop("light_system_device", None)
                cleared += 1

    if cleared:
        doc.geometry = json.dumps(geometry)
    return cleared
