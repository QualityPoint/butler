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
        self.validate_facility_types()
        self.validate_light_systems()
        self.validate_dependencies()
        self.calculate_totals()

    def validate_facility_types(self):
        """Each Facility Type belongs to the amenity once.

        The Table MultiSelect control already hides and drops a value that is picked
        twice, but only in the form — REST, Data Import and server code write the rows
        directly, so the rule has to live here too.
        """
        seen = set()

        for row in self.facility_types:
            # an empty facility_type is left to the mandatory check to report
            if row.facility_type and row.facility_type in seen:
                frappe.throw(
                    _("Row #{0}: {1} is already in the Facility Types table.").format(
                        row.idx, frappe.bold(row.facility_type)
                    ),
                    title=_("Duplicate Facility Type"),
                )
            seen.add(row.facility_type)

    def validate_light_systems(self):
        """Every light system has to be a coherent way of wiring the amenity on its own:
        it appears once, it consumes at least one line, and it fits within the amenity's
        line count.

        Per row, deliberately not as a total. The rows are **alternatives** — a quotation
        line picks exactly one (`Butler Quotation Item.light_system`) — so they never draw
        on the lines at the same time and have no shared budget to exhaust. Summing them
        made a well-formed amenity unsavable as soon as it offered a few ways to wire the
        same lines.

        A negative `used_lines` is already refused by the field's non_negative flag, and
        zero is not — `reqd` accepts 0 on an Int — hence the explicit floor here.
        """
        seen = set()

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

            if cint(row.used_lines) > cint(self.lines):
                frappe.throw(
                    _("Row #{0}: {1} uses {2} lines, but this amenity only has {3}.").format(
                        row.idx, frappe.bold(row.system_name or _("this light system")),
                        frappe.bold(cint(row.used_lines)), frappe.bold(cint(self.lines)),
                    ),
                    title=_("Too many lines used"),
                )

    def validate_dependencies(self):
        """The Primary Amenities table has to describe a graph that can actually be drawn.

        A dependant amenity may not outnumber its primaries on a quotation
        (`ButlerQuotation.validate_dependencies`), so a table that names this amenity, or
        names one twice, or closes a ring, makes that rule unsatisfiable or meaningless.
        None of it was checked before.
        """
        if not self.is_dependant_amenity:
            # `clear_dependent_fields` empties the table in before_save — i.e. *after*
            # this runs — so an unticked doc can still be carrying rows that are on their
            # way out. Judging them would refuse the very save that discards them.
            return

        primaries = []
        for row in self.depends_on:
            # an empty amenity is left to the field's mandatory check to report
            if not row.amenity:
                continue

            # `autoname` is `field:amenity_name` and set_new_name() runs before validate,
            # so self.name is populated here even on a first insert.
            if row.amenity == self.name:
                frappe.throw(
                    _("Row #{0}: An amenity cannot depend on itself.").format(row.idx),
                    title=_("Invalid Dependency"),
                )

            if row.amenity in primaries:
                frappe.throw(
                    _("Row #{0}: {1} is already in the Primary Amenities table.").format(
                        row.idx, frappe.bold(row.amenity)
                    ),
                    title=_("Duplicate Primary Amenity"),
                )
            primaries.append(row.amenity)

        self.validate_dependency_cycle(primaries)
        self.warn_about_disabled_primaries(primaries)

    def validate_dependency_cycle(self, primaries):
        """Refuse `A -> B -> A`, and longer rings.

        Walked breadth-first, one indexed query per level rather than one per amenity: a
        real catalogue is a level or two deep, so this costs a query or two however large
        it is. Only *saved* rows are walked — this document's own rows are the seed,
        because on this save they aren't in the database yet.

        `visited` is not just an optimisation: it is what makes the walk terminate against
        a ring that already exists in the data (written before this check, or straight
        through `frappe.db`).
        """
        frontier = set(primaries)
        if not frontier:
            return

        reached_by = {primary: None for primary in frontier}  # amenity -> who named it
        visited = set(frontier)

        while frontier:
            rows = frappe.get_all(
                "Amenity Depends On",
                filters={
                    "parenttype": "Amenity",
                    "parentfield": "depends_on",
                    "parent": ("in", list(frontier)),
                },
                fields=["parent", "amenity"],
            )

            next_frontier = set()
            for row in rows:
                if not row.amenity:
                    continue

                if row.amenity == self.name:
                    frappe.throw(
                        _("This would create a circular dependency: {0}").format(
                            frappe.bold(" &rarr; ".join(self.dependency_chain(row.parent,
                                                                             reached_by)))
                        ),
                        title=_("Circular Dependency"),
                    )

                if row.amenity in visited:
                    continue
                visited.add(row.amenity)
                reached_by[row.amenity] = row.parent
                next_frontier.add(row.amenity)

            frontier = next_frontier

    def dependency_chain(self, closer, reached_by):
        """The ring, written out for the error message: self -> ... -> closer -> self."""
        chain = [self.name, closer]
        node = closer
        while reached_by.get(node):
            node = reached_by[node]
            chain.append(node)
        chain.append(self.name)
        return list(reversed(chain))

    def warn_about_disabled_primaries(self, primaries):
        """A disabled primary cannot be drawn — the Facility Builder's palette filters
        `disabled = 0` — so the dependant becomes undrawable, and only this master knows
        it. Worth saying out loud, but never worth refusing a save over: disabling happens
        elsewhere and must not retroactively break an unrelated edit here.
        """
        if not primaries:
            return

        disabled = frappe.get_all(
            "Amenity", filters={"name": ("in", primaries), "disabled": 1}, pluck="name"
        )
        if disabled:
            frappe.msgprint(
                _("{0} is disabled, so it can no longer be placed. {1} cannot be quoted "
                  "until it is enabled again.").format(
                    frappe.bold(", ".join(sorted(disabled))), frappe.bold(self.name)),
                title=_("Primary amenity disabled"),
                indicator="orange",
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

    def on_trash(self):
        """Say which amenities depend on this one before Frappe's own link check does.

        `check_if_doc_is_linked` already blocks the delete, but its message names the
        child table ("linked with Amenity Depends On"), which tells nobody which amenity
        to go and fix.
        """
        dependants = frappe.get_all(
            "Amenity Depends On",
            filters={
                "parenttype": "Amenity",
                "parentfield": "depends_on",
                "amenity": self.name,
            },
            pluck="parent",
        )
        if dependants:
            frappe.throw(
                _("{0} is a primary amenity for {1}. Remove it from their Primary "
                  "Amenities tables first.").format(
                    frappe.bold(self.name),
                    frappe.bold(", ".join(sorted(set(dependants))))),
                title=_("Amenity in use"),
            )

    def on_update(self):
        """Sync the annex rows out to their standard Annex Price records.

        Runs on_update rather than before_save because an Annex Price links back to this
        Amenity: on a first insert the row doesn't exist in the database until after
        before_save, so creating the price there fails link validation.
        """
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


@frappe.whitelist()
def get_amenity_annexes(amenities):
    """What each amenity is composed of, with the icon to draw each annex by.

    The Facility Builder's Annexes layer shows an amenity's composition on the canvas, so
    it needs the same list `expand_amenity_rows` seeds a quotation from — plus each
    Annex's `icon`, which lives on the Annex master rather than on the composition row.

    Batched: the builder asks once for every amenity on the floor plan, and the icons for
    all of them are fetched in a single query rather than one per amenity.
    """
    if isinstance(amenities, str):
        amenities = frappe.parse_json(amenities)

    compositions = {
        name: frappe.get_cached_doc("Amenity", name).annexes
        for name in {a for a in (amenities or []) if a}
    }

    annexes = {row.annex for rows in compositions.values() for row in rows if row.annex}
    masters = {
        row.name: row
        for row in frappe.get_all(
            "Annex",
            filters={"name": ("in", list(annexes))},
            fields=["name", "annex_name", "icon", "annex_item"],
        )
    } if annexes else {}
    uoms = _annex_uoms(masters)

    return {
        name: [
            {
                "annex": row.annex,
                "annex_name": masters.get(row.annex, {}).get("annex_name") or row.annex,
                "icon": masters.get(row.annex, {}).get("icon"),
                "qty": flt(row.qty),
                "uom": row.uom,
                "uoms": uoms.get(row.annex) or [],
            }
            for row in rows
            if row.annex
        ]
        for name, rows in compositions.items()
    }


def _annex_uoms(masters):
    """`annex -> [uom]`, the UOMs each annex's Item is convertible in.

    The Features panel picks a UOM from a plain `<select>` rather than a Link, so the whole
    list has to travel with the composition. Same rule as
    `butler.utils.queries.get_annex_uom_query` — the Item's UOM Conversion Detail rows, in
    their configured order — resolved for every annex in one query instead of one lookup
    per open dropdown.
    """
    items = {row.annex_item for row in masters.values() if row.annex_item}
    if not items:
        return {}

    detail = frappe.qb.DocType("UOM Conversion Detail")
    by_item = {}
    for parent, uom in (
        frappe.qb.from_(detail)
        .select(detail.parent, detail.uom)
        .where(detail.parent.isin(list(items)))
        .orderby(detail.parent)
        .orderby(detail.idx)
        .run()
    ):
        by_item.setdefault(parent, []).append(uom)

    return {
        annex: by_item.get(row.annex_item, [])
        for annex, row in masters.items()
        if row.annex_item
    }


@frappe.whitelist()
def get_dependency_graph():
    """`{dependant amenity: [primary amenity, ...]}` for the whole catalogue.

    The Facility Builder compares placement counts live as you draw, on every layer and
    before anything at all is placed — so unlike `get_amenity_options` this can't be keyed
    on what is already on the plan, and unlike the Features panel's catalogue it can't
    wait for that layer to be opened. It is loaded once with the other catalogues.

    Only the flagged amenities travel, so a catalogue of hundreds with a handful of
    dependants sends a handful of rows.

    Disabled amenities are kept, deliberately: an amenity disabled after a quotation was
    drawn is still on that quotation and still counted by the server's check, and the
    client has to agree with it.
    """
    dependants = frappe.get_all(
        "Amenity", filters={"is_dependant_amenity": 1}, pluck="name")
    if not dependants:
        return {}

    graph = {}
    for row in frappe.get_all(
        "Amenity Depends On",
        filters={
            "parenttype": "Amenity",
            "parentfield": "depends_on",
            "parent": ("in", dependants),
        },
        fields=["parent", "amenity"],
        order_by="parent asc, idx asc",
    ):
        if not row.amenity:
            continue
        primaries = graph.setdefault(row.parent, [])
        if row.amenity not in primaries:  # a duplicate row on the master is not two needs
            primaries.append(row.amenity)

    return graph
