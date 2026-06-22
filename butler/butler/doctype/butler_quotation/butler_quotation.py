# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

import erpnext
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import add_days, add_months, cint, flt, fmt_money, getdate, nowdate


class ButlerQuotation(Document):
    def before_validate(self):
        self.set_default_company()
        self.set_default_valid_till()
        self.consolidate_amenities()

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
        self.calculate_totals()
        self.validate_valid_till()

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
            floors = self.floor_count if (
                info["depends_on_floor_count"] and self.floor_count) else 1
            row.amount = flt(floors) * flt(row.rate) * flt(row.qty)
            amenity_count += row.qty
            items_total += flt(row.amount)
        self.amenity_count = amenity_count
        self.enforce_standard_price(deviations)

        # --- bundle price (the bundle is sold at its own flat price) ---
        if self.order_type == "Bundle" and self.bundle_type:
            self.bundle_price = flt(
                frappe.db.get_value(
                    "Butler Bundle", self.bundle_type, "bundle_price")
            )
        else:
            self.bundle_price = 0

        # --- total: bundle price for a Bundle, else the summed amenities ---
        self.total = self.bundle_price if self.order_type == "Bundle" else items_total

        # --- additional discount → net total ---
        if self.apply_discount_by == "Percentage":
            self.discount_amount = flt(
                self.total) * flt(self.additional_discount_percentage) / 100.0
        elif self.apply_discount_by == "Amount":
            self.additional_discount_percentage = (
                flt(self.discount_amount) / flt(self.total) *
                100.0 if self.total else 0
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
        action = frappe.db.get_single_value(
            "Butler Settings", "maintain_standard_price_action") or "Stop"
        if action == "Ignore":
            return

        lines = "".join(
            "<li>{0} — {1} (standard {2})</li>".format(
                frappe.bold(r.amenity), fmt_money(
                    r.rate), fmt_money(r.amenity_price)
            )
            for r in deviations
        )
        msg = _("These amenities don't keep the standard price:") + \
            f"<ul>{lines}</ul>"

        if action == "Warn":
            frappe.msgprint(msg, title=_(
                "Standard price not maintained"), indicator="orange")
            return

        # Stop: block, unless the current user holds the override role (then warn + allow)
        override_role = frappe.db.get_single_value(
            "Butler Settings", "role_to_override_stop_action")
        if override_role and override_role in frappe.get_roles():
            frappe.msgprint(
                msg + "<br>" +
                _("Overridden by your role: {0}").format(
                    frappe.bold(override_role)),
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

    def set_missing_values(src, target):
        if customer:
            target.customer = customer.name
            target.customer_name = customer.customer_name
        target.flags.ignore_permissions = ignore_permissions
        target.run_method("set_missing_values")
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

    links = frappe.get_all(
        "Dynamic Link",
        filters={
            "parenttype": "Facility",
            "parent": facility,
            "link_doctype": ["in", ["Customer", "Lead"]],
        },
        fields=["link_doctype", "link_name"],
    )
    customer = next(
        (l.link_name for l in links if l.link_doctype == "Customer"), None)
    if customer:
        return frappe.get_doc("Customer", customer)

    lead = next((l.link_name for l in links if l.link_doctype == "Lead"), None)
    if not lead:
        frappe.throw(
            _("Link a Customer or Lead to Facility {0} before creating a Sales Order.").format(
                frappe.bold(facility)
            )
        )

    existing_customer = frappe.db.get_value("Customer", {"lead_name": lead})
    if existing_customer:
        return frappe.get_doc("Customer", existing_customer)

    from erpnext.crm.doctype.lead.lead import _make_customer as create_customer_from_lead

    new_customer = create_customer_from_lead(
        lead, ignore_permissions=ignore_permissions)
    new_customer.flags.ignore_permissions = ignore_permissions
    new_customer.insert(ignore_permissions=ignore_permissions)
    return new_customer
