// The Butler Quotation line editor.
//
// `Butler Quotation.amenities` holds two row types — an amenity row and the annex rows
// beneath it (see docs/quotation_pricing/annexes.md). A stock grid can't express that: it
// would show one flat list of 88-column rows where most fields are blank for whichever
// type the row isn't. So the table is hidden + read-only and rendered here instead, as a
// master–detail panel: floor tabs, a searchable list of the floor's rooms grouped by
// amenity, and the selected room's detail showing only the fields each row owns. The panel
// has a fixed height, so a 90-room floor no longer pushes the rest of the quotation down.
// See docs/quotation_line_editor.md.
//
// It is still a child-table editor, though, so it follows the four rules
// frappe.ui.form.Grid / GridRow are built on rather than inventing its own:
//
//   1. Rows persist.  Grid.render_result_rows reuses the GridRow already rendered for a
//      doc, builds one only for a doc it hasn't seen, removes the stale ones and reorders
//      the DOM from the first mismatch — it never empties the container.
//      Here: AmenitiesEditor.render keeps `cards`, a placement → AmenityCard map, the way
//      the grid keeps grid_rows_by_docname. The room list holds no controls, so it is
//      redrawn freely, like the floor tabs.
//
//   2. Opening a row touches only that row.  GridRow.toggle_view builds its GridRowForm
//      once and then shows or hides it; no sibling is redrawn.
//      Here: AmenityCard.show builds a room's detail the first time it is selected and
//      only shows or hides it after, so going back to a room reuses what is on screen.
//      Nothing that merely reveals a field re-renders any more either — a price that
//      appears when its box is ticked is built up front and shown by sync, which is what
//      a docfield's depends_on does.
//
//   3. A control is built once and then kept.  GridRow.make_control opens with
//      `if (column.field) return;` — a cell that already has a control is never given a
//      second one.
//      Here: the annex cells are built when the room is first selected and live for as
//      long as its detail does. Frappe goes further and builds no control at all until a cell is
//      clicked (each column carries a static_area of plain text beside a hidden
//      field_area), which is how a 50-row grid avoids building 250 controls. This editor
//      deliberately doesn't: a room holds a handful of annex rows, and hiding their
//      inputs behind a click to save that is a bad trade. What cost us was rebuilding
//      controls, and rules 1, 2 and 4 are what stop that.
//
//   4. Repainting a value is control.refresh(), never control.set_value().  set_value runs
//      validate_and_set_in_model — the entire write chain, df.change included — while
//      refresh() re-reads frappe.model.get_value and repaints the input.
//      GridRow.refresh_field calls field.refresh(); so does every syncer here.
//
// The server stays authoritative for every number: controls write through the model the
// way a grid cell does (set_model_value → frappe.model.set_value), the Butler Quotation
// Item triggers in butler_quotation.js ask for a recalculation, and sync() paints the
// answer back into the controls that are already on screen.

frappe.provide("butler.ui");

// A child row held in a closure goes stale. Every server response runs frappe.model.sync,
// and add_to_locals *replaces* locals[doctype][name] rather than updating it in place
// (frappe/public/js/frappe/model/sync.js) — so the object a render captured is detached
// from the model the moment a recalc returns. Frappe's own GridRow re-reads locals at the
// top of refresh() and toggle_view() for exactly this reason, and so does every read here.
const live = (row) => (row && locals[row.doctype] && locals[row.doctype][row.name]) || row;

// What a card is keyed by: the drawn placement it shows. A row that has not been saved yet
// may carry no placement id (one typed into the table, or a document from before the
// field existed); its docname still tells it apart, so every placement keeps its own card.
const placement_key = (row) => row.placement_id || row.name;

// The master–detail panel's own rules. Injected once rather than written inline like the
// rest of this file, because the panel has to stack on a narrow screen and only a
// stylesheet can say that. Every colour is a Frappe theme variable, so dark mode follows.
const MASTER_DETAIL_STYLE = `
.butler-md { display: grid; grid-template-columns: minmax(240px, 340px) minmax(0, 1fr);
    height: clamp(420px, 70vh, 720px); margin-top: .75rem;
    border: 1px solid var(--border-color); border-radius: var(--border-radius-md); overflow: hidden; }
.butler-room-list { overflow-y: auto; border-right: 1px solid var(--border-color); outline: none; }
.butler-room-list:focus-visible { box-shadow: inset 0 0 0 2px var(--btn-primary); }
.butler-room-detail { overflow-y: auto; min-width: 0; }
.butler-room-heading { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px;
    width: 100%; margin: 0; border: 0; border-bottom: 1px solid var(--border-color); border-radius: 0;
    padding-block: 6px; padding-inline: 10px; background: var(--subtle-accent); color: var(--text-color);
    font: inherit; text-align: start; cursor: pointer; }
.butler-room-heading:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--btn-primary); }
.butler-room-heading.has-selected { box-shadow: inset 3px 0 0 var(--btn-primary); }
.butler-room-caret { display: inline-flex; align-items: center; justify-content: center; width: 16px; flex-shrink: 0; }
.butler-room-caret .icon { margin: 0; }
.butler-room-heading-avatar { display: inline-flex; flex-shrink: 0; }
.butler-room-heading-avatar .avatar { margin: 0; }
.butler-room-heading .butler-room-heading-name { font-weight: 600; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.butler-room-heading .butler-room-heading-count { font-size: var(--text-xs); font-weight: 600; border-radius: 10px;
    min-width: 20px; padding: 0 6px; text-align: center; white-space: nowrap;
    background: var(--bg-blue); color: var(--text-on-blue); }
.butler-room-heading .butler-room-heading-total { margin-inline-start: auto; white-space: nowrap; font-weight: 600;
    font-variant-numeric: tabular-nums; }
/* rooms sit under their heading, indented past its chevron (10px pad + 16px chevron + 8px gap) */
.butler-room-item { display: flex; align-items: center; gap: 8px; cursor: pointer;
    padding-block: 6px; padding-inline: 34px 10px; border-bottom: 1px solid var(--border-color); }
.butler-room-item:hover { background: var(--subtle-accent); }
.butler-room-item.selected { background: var(--bg-blue); color: var(--text-on-blue); }
.butler-room-item .butler-room-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.butler-room-item .butler-room-amount { font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
.butler-room-mark { font-size: var(--text-xs); border-radius: 8px; padding: 0 6px; white-space: nowrap;
    background: var(--bg-orange); color: var(--text-on-orange); }
.butler-room-dot { color: var(--text-on-purple); }
/* An applied filter button takes its own Frappe indicator colour, so several applied at
   once stay tellable apart; the room marks in the list use the same colours. */
.btn.butler-filter-on { border-color: transparent; font-weight: 600; }
.btn.butler-filter-on:hover, .btn.butler-filter-on:focus { filter: brightness(0.96); }
.btn.butler-filter-purple { background: var(--bg-purple); color: var(--text-on-purple); }
.btn.butler-filter-green { background: var(--bg-green); color: var(--text-on-green); }
.btn.butler-filter-yellow { background: var(--bg-yellow); color: var(--text-on-yellow); }
.btn.butler-filter-orange { background: var(--bg-orange); color: var(--text-on-orange); }
.butler-manager-filter { width: 18rem; max-width: 100%; }
/* Frappe gives a control that is the last child of its container a bottom margin
   (.form-group.frappe-control:last-child, desk/form.scss). This one is alone in its
   wrapper, so it got that margin, which lifted it off the search box's line. Out-specify it. */
.butler-filter-row .butler-manager-filter > .form-group.frappe-control { margin: 0; }
.butler-room-search { width: 18rem; max-width: 100%; }
@media (max-width: 767px) {
    .butler-md { grid-template-columns: 1fr; height: auto; }
    .butler-room-list { max-height: 300px; border-right: 0; border-bottom: 1px solid var(--border-color); }
}`;

// Bumped whenever this file changes, so a stale bundle can be identified from the browser
// console rather than guessed at: butler.ui.AmenitiesEditor.BUILD
butler.ui.AmenitiesEditor = class AmenitiesEditor {
    static BUILD = "2026-10-04-manager-from-amenity";

    // The list's filter chips. `label` is a function so the translation is looked up when
    // the chip is drawn, not when this file loads. `editor` answers what a row can't on its
    // own (which Light System is the default).
    static FILTERS = [
        {
            key: "customised", color: "purple", label: () => __("Customised"),
            test: (row, editor) => editor.is_customised(row),
        },
        {
            key: "sound", color: "green", label: () => __("Sound on"),
            test: (row) => Boolean(cint(row.has_sound_system)),
        },
        {
            key: "light", color: "yellow", label: () => __("Non-default light system"),
            test: (row, editor) => editor.is_off_default_light(row),
        },
        {
            key: "quotation_price", color: "orange", label: () => __("Quotation Price changed"),
            test: (row) => Boolean(cint(row.quotation_price_changed)),
        },
    ];

    constructor(wrapper, frm, { on_change } = {}) {
        this.$wrapper = $(wrapper);
        this.frm = frm;
        this.on_change = on_change || (() => { });
        this.options = {};           // amenity name -> what that Amenity offers
        this.cards = new Map();      // placement key -> AmenityCard  (≈ grid_rows_by_docname)
        this.tab_syncers = [];
        this.list_syncers = [];
        this.active_floor = null;    // one floor shown at a time, like the Facility Builder
        this.selected = null;        // placement key of the room in the detail pane
        this.query = "";
        this.filters = new Set();
        this.managers = [];          // Butler Managers the list is narrowed to, [] for all
        this.expanded = new Set();   // "floor::amenity" groups opened in the list; all start closed
        this.open_matches = false;   // open every group holding a match on the next render
        this.default_light_system = undefined; // read once; null when none is marked default
    }

    // Group the flat table the way the server does (group_amenity_rows): every row
    // carries the `placement_id` of the drawn amenity it belongs to, so an amenity row
    // opens a group and each annex row joins the one it names. A row without an id joins
    // the amenity row above it, the same rule as ensure_placement_ids on the server.
    get_groups() {
        const groups = [];
        const at = {};

        for (const row of this.frm.doc.amenities || []) {
            if (!row.annex) {
                at[row.placement_id] = groups.length;
                groups.push({ amenity_row: row, annex_rows: [] });
                continue;
            }
            const position = at[row.placement_id];
            if (position !== undefined) groups[position].annex_rows.push(row);
        }
        return groups;
    }

    refresh() {
        this.reset_for_document();
        const names = [...new Set((this.frm.doc.amenities || []).map((r) => r.amenity).filter(Boolean))];
        // What an Amenity offers doesn't change while a quotation is being edited, so
        // only ask about ones we haven't seen — a full refresh then costs no round trip
        // at all once the cache is warm.
        const unknown = names.filter((name) => !(name in this.options));
        const loads = [];
        if (unknown.length) {
            loads.push(frappe
                .xcall("butler.butler.doctype.butler_quotation.butler_quotation.get_amenity_options",
                    { amenities: unknown })
                .then((options) => Object.assign(this.options, options || {})));
        }
        // The Facility Builder's own reference point for "customised" (has_custom_features
        // in store.js): a light system other than the default one.
        if (this.default_light_system === undefined) {
            loads.push(frappe.db
                .get_value("Light System", { is_default: 1 }, "name")
                .then((r) => (this.default_light_system = r?.message?.name || null)));
        }
        if (!loads.length) {
            this.render();
            return Promise.resolve();
        }
        return Promise.all(loads).then(() => this.render());
    }

    // Frappe builds one form per doctype and reuses it for every document opened in it
    // (FormView.make_form), so this editor outlives the quotation it was made for. A
    // control fixes its read-only state when it is built (make_field), and a Submit keeps
    // every docname, so without this an open detail would leave its prices editable on the
    // submitted quotation. Start over whenever the document or its docstatus changes. The
    // Amenity options are dropped only for a different document, so they are re-read for
    // it (an Amenity edited meanwhile shows its new lines) but a Submit costs no round trip.
    reset_for_document() {
        const { name, docstatus } = this.frm.doc;
        if (name === this.docname && docstatus === this.docstatus) return;

        if (name !== this.docname) {
            this.options = {};
            this.active_floor = null;
            this.selected = null;
            this.expanded.clear();
            this.query = "";
            this.filters.clear();
            if (this.$search) this.$search.val("");
            this.set_managers([]);
        }
        this.docname = name;
        this.docstatus = docstatus;
        this.retire_cards(new Set());
    }

    // Floor tabs, then the list of the active floor's rooms that pass the search and the
    // filters, then the selected room's detail. The list and the tabs hold no controls and
    // are redrawn each time; the details hold controls and are kept (rules 1–3).
    render() {
        const groups = this.get_groups();
        this.make_skeleton();

        this.$empty.toggle(!groups.length);
        this.$root.toggle(groups.length > 0);
        if (!groups.length) {
            this.retire_cards(new Set());
            return;
        }

        // floor → its amenity groups, in the order the table already carries
        const floors = new Map();
        for (const group of groups) {
            const floor = group.amenity_row.floor_type || __("Unassigned");
            if (!floors.has(floor)) floors.set(floor, []);
            floors.get(floor).push(group);
        }

        // keep the chosen floor across re-renders, but fall back when it has gone away
        // (its last amenity removed, or the quotation reloaded)
        if (!floors.has(this.active_floor)) this.active_floor = floors.keys().next().value;

        this.render_floor_tabs(floors);
        this.render_chips();

        const shown = (floors.get(this.active_floor) || []).filter((g) => this.matches(g.amenity_row));
        // Keep the selection while its room is still listed. Nothing is picked for you: the
        // groups start closed, and a detail for a room you can't see in the list would only
        // confuse — the pane says how to pick one instead.
        if (!shown.some((g) => placement_key(g.amenity_row) === this.selected)) this.selected = null;

        // A search or filter that just changed opens every group holding a match, so a
        // closed group never hides what was searched for. Done once per change, so a
        // group closed afterwards stays closed.
        if (this.open_matches) {
            for (const g of shown) this.expanded.add(this.group_key(g.amenity_row.amenity));
            this.open_matches = false;
        }
        this.render_list(shown);

        // Details are keyed by placement, not docname: a Facility Builder save replaces the
        // whole child table, so docnames churn and every detail would be torn down and
        // rebuilt. One whose placement has left the document is retired; the rest are
        // re-pointed at the current rows and kept, hidden, until selected again.
        this.retire_cards(new Set(groups.map((g) => placement_key(g.amenity_row))));
        for (const group of groups) {
            const card = this.cards.get(placement_key(group.amenity_row));
            if (card) card.refresh(group);
        }
        const chosen = shown.find((g) => placement_key(g.amenity_row) === this.selected);
        if (chosen && !this.cards.has(this.selected)) {
            this.cards.set(this.selected, new butler.ui.AmenityCard({ editor: this, group: chosen }));
        }
        for (const [key, card] of this.cards) card.show(key === this.selected);
        this.$detail_empty.toggle(!this.selected && shown.length > 0);

        this.sync();
    }

    matches(row) {
        row = live(row);
        const query = this.query.trim().toLowerCase();
        if (query && !`${row.amenity || ""} ${row.alias || ""}`.toLowerCase().includes(query)) return false;
        if (this.managers.length && !this.managers.includes(this.manager_of(row))) return false;
        return [...this.filters].every((key) =>
            AmenitiesEditor.FILTERS.find((f) => f.key === key).test(row, this));
    }

    is_off_default_light(row) {
        return Boolean(this.default_light_system && row.light_system
            && row.light_system !== this.default_light_system);
    }

    // The Facility Builder's has_custom_features, so a room reads as customised in both.
    is_customised(row) {
        return Boolean(cint(row.annexes_customised) || this.is_off_default_light(row)
            || cint(row.has_sound_system));
    }

    // Built once and kept: the bar and the panel outlive every render.
    make_skeleton() {
        if (this.$root) return;
        if (!document.getElementById("butler-md-style")) {
            $(`<style id="butler-md-style"></style>`).text(MASTER_DETAIL_STYLE).appendTo(document.head);
        }
        this.$root = $(`<div class="butler-lines"></div>`).appendTo(this.$wrapper);
        // Three rows: the floors; then the Butler Manager and search filters; then the
        // filter buttons. The floors scroll sideways when there are more than fit.
        const $bar = $(`
            <div class="butler-floor-bar" style="display:flex;flex-direction:column;gap:8px;
                border-bottom:1px solid var(--border-color);padding-bottom:8px"></div>
        `).appendTo(this.$root);
        this.$tabs = $(`
            <div class="butler-floor-tabs" style="display:flex;gap:4px;min-width:0;
                overflow-x:auto;scrollbar-width:thin;padding-bottom:2px"></div>
        `).appendTo($bar);
        const $filters = $(`
            <div class="butler-filter-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px"></div>
        `).appendTo($bar);
        this.$chips = $(`
            <div class="butler-room-filters" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px"></div>
        `).appendTo($bar);

        // Butler Manager: a MultiSelectList, the control a Frappe report uses for a
        // multi-value filter (and the Facility Builder for Amenity Category). It offers only
        // the managers whose amenities are on this quotation, each with its room count, and
        // lists the rooms of any manager picked. Built once and kept (rule 3); a
        // programmatic reset goes through set_managers, which the onchange guard
        // recognises — set_value fires onchange itself.
        const $manager = $(`<div class="butler-manager-filter"></div>`).appendTo($filters);
        this.manager_control = frappe.ui.form.make_control({
            parent: $manager.get(0),
            df: {
                fieldtype: "MultiSelectList",
                fieldname: "butler_manager_filter",
                placeholder: __("Butler Manager"),
                get_data: (txt) => this.manager_options(txt),
                onchange: () => {
                    const picked = [...(this.manager_control.get_value() || [])].sort();
                    if (JSON.stringify(picked) === JSON.stringify(this.managers)) return; // programmatic sync
                    this.managers = picked;
                    this.open_matches = this.is_filtering();
                    this.render();
                },
            },
            render_input: true,
            // Input only, as a Frappe report renders its filters (page.js add_field): no
            // label row, no help box, no form-group spacing around the dropdown.
            only_input: true,
        });
        // Anchor the dropdown under its input, as the Facility Builder does, so Bootstrap
        // doesn't fly it to the page's far left.
        this.manager_control.$list_wrapper?.find('[data-toggle="dropdown"]').attr("data-display", "static");

        // input-xs, the size Frappe's report filters and the MultiSelectList beside it use
        this.$search = $(`<input type="search" class="form-control input-xs butler-room-search">`)
            .attr("placeholder", __("Search amenity or alias…"))
            .appendTo($filters);
        this.$search.on("input", () => {
            this.query = this.$search.val() || "";
            this.open_matches = this.is_filtering();
            this.render();
        });

        this.$chips.on("click", "[data-filter]", (e) => {
            const key = $(e.currentTarget).attr("data-filter");
            if (this.filters.has(key)) this.filters.delete(key);
            else this.filters.add(key);
            this.open_matches = this.is_filtering();
            this.render();
        });

        this.$panel = $(`<div class="butler-md"></div>`).appendTo(this.$root);
        this.$list = $(`<div class="butler-room-list" tabindex="0" role="listbox"></div>`)
            .attr("aria-label", __("Amenities"))
            .appendTo(this.$panel);
        this.$detail = $(`<div class="butler-room-detail"></div>`).appendTo(this.$panel);
        this.$detail_empty = $(`<div class="text-muted" style="padding:1rem"></div>`)
            .text(__("Open a group in the list and pick an amenity to see its add-ons and annexes."))
            .appendTo(this.$detail);
        // a heading opens or closes its group; a <button>, so Enter and Space do it too
        this.$list.on("click", ".butler-room-heading", (e) => {
            this.toggle_group($(e.currentTarget).attr("data-group"));
        });

        this.$list.on("click", ".butler-room-item", (e) => {
            this.select($(e.currentTarget).attr("data-key"));
        });
        // ↑ / ↓ walk the list while it has focus, the way a listbox does.
        this.$list.on("keydown", (e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const keys = this.$list.find(".butler-room-item").get().map((el) => el.getAttribute("data-key"));
            const at = keys.indexOf(this.selected);
            const next = keys[Math.min(keys.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
            this.select(next);
        });

        this.$empty = $(`
            <div class="text-muted" style="padding:1rem 0">${__("No amenities yet.")}</div>
        `).appendTo(this.$wrapper);
    }

    select(key) {
        if (!key || key === this.selected) return;
        this.selected = key;
        this.render();
        const item = this.$list.find(".butler-room-item.selected").get(0);
        if (item) item.scrollIntoView({ block: "nearest" });
        // keep ↑ / ↓ working after a click, without the browser jumping the page
        this.$list.get(0).focus({ preventScroll: true });
    }

    clear_filters() {
        this.query = "";
        this.filters.clear();
        this.$search.val("");
        this.set_managers([]);
        this.render();
    }

    is_filtering() {
        return Boolean(this.query.trim() || this.filters.size || this.managers.length);
    }

    // Groups are per floor: the same amenity on two floors opens and closes separately.
    group_key(amenity) {
        return `${this.active_floor}::${amenity || ""}`;
    }

    toggle_group(key) {
        if (this.expanded.has(key)) this.expanded.delete(key);
        else this.expanded.add(key);
        this.render();
        // the list was redrawn, so give focus back to the same heading for the keyboard
        const heading = this.$list.find(".butler-room-heading").get()
            .find((el) => el.getAttribute("data-group") === key);
        if (heading) heading.focus({ preventScroll: true });
    }

    // Moves the manager filter without it reading as a user's pick: `this.managers` is set
    // first, so the control's onchange finds nothing changed and doesn't re-render.
    set_managers(names) {
        this.managers = [...(names || [])].sort();
        if (!this.manager_control) return;
        const current = [...(this.manager_control.get_value() || [])].sort();
        if (JSON.stringify(current) !== JSON.stringify(this.managers)) {
            this.manager_control.set_value(this.managers);
        }
    }

    // The Amenity's current Butler Manager (get_amenity_options), so a manager set on the
    // Amenity counts at once; the row's own copy, refreshed by "Reset Amenity → Details" or a
    // save, is the fallback.
    manager_of(row) {
        return this.options[row.amenity]?.butler_manager || row.butler_manager || "";
    }

    // The managers whose amenities are on this quotation, with how many rooms each has.
    // MultiSelectList writes `label` straight into its HTML, so the name is escaped.
    manager_options(txt) {
        const counts = new Map();
        for (const row of this.frm.doc.amenities || []) {
            const manager = this.manager_of(row);
            if (row.annex || !manager) continue;
            counts.set(manager, (counts.get(manager) || 0) + 1);
        }
        const query = (txt || "").trim().toLowerCase();
        return [...counts.keys()]
            .sort()
            .filter((name) => !query || name.toLowerCase().includes(query))
            .map((name) => ({
                value: name,
                label: frappe.utils.escape_html(name),
                description: __("{0} amenities", [counts.get(name)]),
            }));
    }

    retire_cards(keep) {
        for (const [name, card] of this.cards) {
            if (keep.has(name)) continue;
            card.destroy();
            this.cards.delete(name);
        }
    }

    // The rooms of the active floor, under a sticky heading per amenity. The server's
    // order_amenity_rows keeps every placement of one amenity together, so a heading is
    // just a run of consecutive rooms with the same amenity — no sorting needed here.
    render_list(shown) {
        const scroll = this.$list.scrollTop();
        this.$list.empty();
        this.list_syncers = [];

        if (!shown.length) {
            const $none = $(`<div class="text-muted" style="padding:1rem"></div>`)
                .text(__("No amenities match."))
                .appendTo(this.$list);
            if (this.query || this.filters.size || this.managers.length) {
                $(`<button type="button" class="btn btn-xs btn-default" style="display:block;margin-top:.5rem"></button>`)
                    .text(__("Clear filters"))
                    .on("click", () => this.clear_filters())
                    .appendTo($none);
            }
            return;
        }

        const currency = this.frm.doc.currency;
        for (let i = 0; i < shown.length;) {
            const amenity = shown[i].amenity_row.amenity;
            let j = i;
            while (j < shown.length && shown[j].amenity_row.amenity === amenity) j++;
            const rows = shown.slice(i, j).map((g) => g.amenity_row);
            i = j;

            const key = this.group_key(amenity);
            const open = this.expanded.has(key);
            // Each amenity's heading and rooms share one container. A sticky element sticks
            // only while its parent is on screen: with every heading directly in the list,
            // each one scrolled past stayed pinned at the top and they piled up over one
            // another. Inside its own group, a heading sticks while its rooms scroll by and
            // the next group's heading pushes it away.
            const $group = $(`<div class="butler-room-group" role="group"></div>`).appendTo(this.$list);
            const $heading = $(`
                <button type="button" class="butler-room-heading">
                    <span class="butler-room-caret"></span>
                    <span class="butler-room-heading-avatar"></span>
                    <span class="butler-room-heading-name"></span>
                    <span class="butler-room-heading-count"></span>
                    <span class="butler-room-heading-total"></span>
                </button>
            `).attr({ "data-group": key, "aria-expanded": open ? "true" : "false" }).appendTo($group);
            // the same pair a collapsible form section uses (frappe/form/section.js)
            $heading.find(".butler-room-caret").html(frappe.utils.icon(open ? "es-line-down" : "chevron-right", "sm"));
            const label = amenity ? __(amenity) : __("(no amenity)");
            // The Amenity's image, drawn with Frappe's own avatar: the image when there is
            // one, otherwise the name's first letter on a palette colour. On the heading only,
            // not on every room. Read from the Amenity (get_amenity_options) so an image
            // attached later shows at once; the row's own copy, fetched on save, is the fallback.
            const image = this.options[amenity]?.image || rows.find((r) => r.image)?.image || null;
            $heading.find(".butler-room-heading-avatar").html(frappe.get_avatar("avatar-small", label, image));
            $heading.find(".butler-room-heading-name").text(label);
            $heading.find(".butler-room-heading-count").text(String(rows.length));
            // a closed group still shows that the room in the detail pane is one of its own
            $heading.toggleClass("has-selected",
                !open && rows.some((r) => placement_key(r) === this.selected));
            const $total = $heading.find(".butler-room-heading-total");
            this.list_syncers.push(() => $total.text(format_currency(
                rows.reduce((sum, r) => sum + flt(live(r).qtn_amenity_amount), 0), currency)));

            if (!open) continue;
            for (const row of rows) {
                const key = placement_key(row);
                const $item = $(`
                    <div class="butler-room-item" role="option">
                        <span class="butler-room-name"></span>
                        <span class="butler-room-dot"></span>
                        <span class="butler-room-mark"></span>
                        <span class="butler-room-amount"></span>
                    </div>
                `).attr("data-key", key).appendTo($group);
                const $name = $item.find(".butler-room-name");
                const $dot = $item.find(".butler-room-dot");
                const $mark = $item.find(".butler-room-mark");
                const $amount = $item.find(".butler-room-amount");

                this.list_syncers.push(() => {
                    const r = live(row);
                    // the customer's name for the room when there is one, as on the plan
                    const alias = (r.alias || "").trim();
                    $name.text(alias && alias !== r.amenity ? alias : (r.amenity ? __(r.amenity) : __("(no amenity)")));
                    $dot.text(this.is_customised(r) ? "●" : "").attr("title", __("Customised"));
                    $mark.text(__("Quotation Price")).attr("title", __("Quotation Price changed"))
                        .toggle(Boolean(cint(r.quotation_price_changed)));
                    $amount.text(format_currency(r.qtn_amenity_amount, currency));
                    const selected = key === this.selected;
                    $item.toggleClass("selected", selected).attr("aria-selected", selected ? "true" : "false");
                });
            }
        }
        this.$list.scrollTop(scroll);
    }

    render_chips() {
        this.$chips.empty();
        for (const filter of AmenitiesEditor.FILTERS) {
            // Frappe's list-view filter button (btn-default at --btn-height). Applied, it takes
            // its own indicator colour rather than one shared grey, so several applied
            // filters can be told apart at a glance.
            const on = this.filters.has(filter.key);
            $(`<button type="button" class="btn btn-sm"></button>`)
                .attr("data-filter", filter.key)
                .addClass(on ? `butler-filter-on butler-filter-${filter.color}` : "btn-default")
                .attr("aria-pressed", this.filters.has(filter.key) ? "true" : "false")
                .text(filter.label())
                .appendTo(this.$chips);
        }
    }

    // Rule 4 — push the model's values back into the controls that already exist. A live
    // recalc only changes numbers; it never reshapes rows (that happens in before_validate,
    // on save), so nothing has to be rebuilt to show its result.
    sync() {
        for (const syncer of this.tab_syncers) syncer();
        for (const syncer of this.list_syncers) syncer();
        for (const card of this.cards.values()) card.sync();
    }

    // One floor at a time, switched by a tab — the same model the Facility Builder uses
    // (FloorTabs.vue), so the two views of the same quotation behave alike. Each tab
    // carries its floor's room count (shown of total while a filter is on) and total, so
    // switching is never blind. Tabs hold no controls, so redrawing them costs nothing.
    render_floor_tabs(floors) {
        this.$tabs.empty();
        this.tab_syncers = [];
        const currency = this.frm.doc.currency;

        for (const [floor, groups] of floors) {
            const active = floor === this.active_floor;
            const shown = groups.filter((g) => this.matches(g.amenity_row)).length;
            // The active tab uses --btn-primary (Frappe's own near-black primary button
            // colour) so it reads as selected the way a primary button does, and follows
            // the theme rather than being a hardcoded black that breaks in dark mode.
            const bg = active ? "var(--btn-primary, #1f272e)" : "var(--card-bg, #fff)";
            const fg = active ? "var(--bg-color, #fff)" : "inherit";
            const $tab = $(`
                <button type="button" class="butler-floor-tab" style="
                    display:inline-flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer;
                    border:1px solid ${active ? "var(--btn-primary, #1f272e)" : "var(--border-color)"};
                    background:${bg};color:${fg};
                    font-weight:${active ? 600 : 400};
                    border-radius:var(--border-radius);
                    padding:4px 10px;font-size:var(--text-sm)">
                    <span class="butler-tab-name"></span>
                    <span class="butler-tab-count" style="font-size:var(--text-xs);border-radius:8px;padding:0 6px;
                        background:${active ? "rgba(255,255,255,.18)" : "var(--subtle-fg,#eef)"}"></span>
                    <span class="butler-tab-total" style="font-size:var(--text-xs);opacity:${active ? ".8" : ".65"}"></span>
                </button>
            `).appendTo(this.$tabs);

            $tab.find(".butler-tab-name").text(floor);
            $tab.find(".butler-tab-count").text(
                shown === groups.length ? groups.length : __("{0} of {1}", [shown, groups.length]));
            $tab.on("click", () => {
                this.active_floor = floor;
                this.open_matches = this.is_filtering();
                this.render();
            });

            const $total = $tab.find(".butler-tab-total");
            const rows = groups.map((g) => g.amenity_row);
            this.tab_syncers.push(() =>
                $total.text(format_currency(
                    rows.reduce((sum, r) => sum + flt(live(r).qtn_amenity_amount), 0), currency))
            );
        }
    }
};

// One room — an amenity row and the annexes under it — as the detail pane shows it. This
// editor's GridRow: it owns its DOM from the moment it is built until it is retired, and
// every update it takes is in place.
//
// The alias chip in the title bar. `--bg-blue`/`--text-on-blue` rather than a grey: the
// bar is already tinted with --subtle-accent, so a grey chip would barely separate from
// it, and both vars are redefined under dark mode, so the pair inverts on its own.
//
// It shrinks before the amenity name does (min-width:0 here, nowhere on the name) and
// ellipsizes, so a long alias can never push the annex count or the amount off the bar.
const ALIAS_CHIP = [
    "font-size:.85em",
    "line-height:1.5",
    "min-width:0",
    "max-width:18rem",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    "padding:.05rem .45rem",
    "border-radius:8px",
    "background:var(--bg-blue)",
    "color:var(--text-on-blue)",
].join(";");

butler.ui.AmenityCard = class AmenityCard {
    constructor({ editor, group }) {
        this.editor = editor;
        this.frm = editor.frm;
        this.head_syncers = [];
        this.body_syncers = [];
        this.built = false;
        this.open = false;

        this.row = live(group.amenity_row);
        this.annex_rows = group.annex_rows.map(live);
        this.annex_key = AmenityCard.key(group.annex_rows);

        this.make();
    }

    // Identifies the *shape* of the annex list, not its values — the body's table only has
    // to be rebuilt when the rows themselves change, which happens in before_validate on
    // save. JSON, not a joined string, for the same reason get_groups uses it.
    static key(annex_rows) {
        return JSON.stringify(annex_rows.map((r) => r.name));
    }

    make() {
        // The title bar sticks to the top of the detail pane, so the room being edited is
        // still named while its annex table scrolls.
        this.$card = $(`
            <div class="butler-amenity" style="display:none">
                <div class="butler-amenity-head" style="position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:.75rem;padding:.6rem .75rem;background:var(--subtle-accent);border-bottom:1px solid var(--border-color)">
                    <span style="flex:1;min-width:0;display:flex;align-items:baseline;gap:.4rem">
                        <span class="butler-amenity-name" style="font-weight:600;white-space:nowrap"></span>
                        <span class="butler-amenity-alias" style="${ALIAS_CHIP}"></span>
                    </span>
                    <span class="butler-annex-count text-muted" style="font-size:.85em"></span>
                    <span class="butler-amount" style="text-align:right;font-weight:600;white-space:nowrap"></span>
                </div>
                <div class="butler-amenity-body" style="padding:.75rem"></div>
            </div>
        `).appendTo(this.editor.$detail);

        this.$body = this.$card.find(".butler-amenity-body");

        const $name = this.$card.find(".butler-amenity-name");
        const $alias = this.$card.find(".butler-amenity-alias");
        const $count = this.$card.find(".butler-annex-count");
        const $amount = this.$card.find(".butler-amount");

        this.head_syncers.push(() => {
            $name.text(this.row.amenity ? __(this.row.amenity) : __("(no amenity)"));
            // The customer's own name for this one placement, beside the amenity's. Shown
            // only where it is genuinely the customer's: `fetch_if_empty` seeds the row with
            // the amenity's own name, so rendering it unconditionally would print
            // "Bedroom  Bedroom" on every placement nobody has renamed.
            //
            // Text, never a control — the alias belongs to a drawn shape, and the Facility
            // Builder is the only place that knows which shape a row came from.
            const alias = (this.row.alias || "").trim();
            const named = Boolean(alias) && alias !== this.row.amenity;
            $alias
                .text(named ? alias : "")
                .attr("title", named ? __("Alias — set in the Facility Builder") : null)
                .toggle(named);
            $count.text(__("{0} annexes", [this.annex_rows.length]));
            $amount.text(format_currency(this.row.qtn_amenity_amount, this.frm.doc.currency));
        });
    }

    // Rule 2 — the body is built the first time this room is selected and only shown or
    // hidden afterwards. No other room hears about it, and this one is never torn down.
    show(on) {
        this.open = on;
        if (on && !this.built) this.build_body();
        this.$card.toggle(on);
    }

    // Re-point at the current model objects. Called instead of a rebuild when render()
    // finds this card already on screen.
    refresh(group) {
        this.row = live(group.amenity_row);

        const key = AmenityCard.key(group.annex_rows);
        // Only a change to the annex rows themselves invalidates the body; new values in
        // the same rows are just a sync. Controls are addressed by docname, so as long as
        // the docnames hold, what is on screen is still pointing at the right documents.
        if (this.built && key !== this.annex_key) this.clear_body();
        this.annex_key = key;
        this.annex_rows = group.annex_rows.map(live);

        if (this.open && !this.built) this.build_body();
    }

    clear_body() {
        this.$body.empty();
        this.body_syncers = [];
        this.built = false;
    }

    destroy() {
        this.$card.remove();
    }

    sync() {
        this.row = live(this.row);
        this.annex_rows = this.annex_rows.map(live);

        for (const syncer of this.head_syncers) syncer();
        if (this.built && this.open) for (const syncer of this.body_syncers) syncer();
    }

    build_body() {
        this.body_syncers = [];
        this.built = true;
        const opts = this.editor.options[this.row.amenity] || {};
        this.render_add_ons(opts);
        this.render_annexes();
    }

    // The add-ons this Amenity can carry — a light-system picker and a sound toggle on
    // every amenity, a floor extra only when it is floor-dependent. Anything else would be
    // a control that can never do anything.
    render_add_ons(opts) {
        // A light system is always fitted now — an amenity that configures none still gets
        // the default, priced from the master across all its lines — so unlike the floor
        // extra this is never absent.
        const has_light = true;
        // Likewise sound: an Amenity with no sound price of its own is charged Butler
        // Settings' default (price_sound_system), so the toggle always means something.
        const has_sound = true;
        const has_floor = cint(opts.depends_on_floor_count) === 1;
        if (!has_light && !has_sound && !has_floor) return;

        const row = () => this.row;

        // Every slot is the same two bands — a label line, then an input line — so the
        // inputs share a baseline whatever control fills them. Aligning at flex-start is
        // what makes that hold: at flex-end a slot carrying a hint under its input was
        // measured hint-included, which lifted its input above its neighbours'.
        const $add_ons = $(`
            <div class="butler-add-ons" style="display:flex;align-items:flex-start;flex-wrap:wrap;gap:.75rem 1.25rem;margin-bottom:.75rem"></div>
        `).appendTo(this.$body);

        // each add-on is one row: its control and its price side by side, never stacked
        const add_on = () => $(`
            <div style="display:flex;align-items:flex-start;gap:.75rem;flex-wrap:wrap"></div>
        `).appendTo($add_ons);
        const slot = ($parent, width) => $(`<div style="min-width:${width}"></div>`).appendTo($parent);
        // Hints hang below the input band, where they no longer shift anything. They take
        // a function and re-read it on every sync, so a hint never sits one edit behind.
        const hint = ($slot, text) => {
            const $hint = $(`
                <div class="text-muted" style="font-size:.8em;margin-top:.25rem"></div>
            `).appendTo($slot);
            this.body_syncers.push(() => $hint.text(text()));
            return $hint;
        };

        if (has_light) {
            const $line = add_on();
            const $picker = slot($line, "13rem");
            this.make_field($picker, row, {
                fieldname: "light_system", fieldtype: "Link", options: "Light System",
                label: __("Light System"),
                // the whole master, not just what this Amenity configures: an unconfigured
                // system is priced from its own standard rate across every line
            });

            // The device the Facility Builder picked for a room on a non-default system.
            // It counts controllers for the whole facility and never touches the price, so
            // it is shown for reference only (builder-owned, read-only).
            const $device = slot($line, "12rem");
            this.make_field($device, row, {
                fieldname: "light_system_device", fieldtype: "Link",
                options: "Light System Device", label: __("Light System Device"),
            });

            // The price and the hint are built now and revealed by sync, the way a
            // docfield's depends_on works. Building them on demand meant every tick of a
            // box re-rendered the whole editor just to add one control.
            const $price = slot($line, "10rem");
            this.make_field($price, row, {
                fieldname: "qtn_light_system_price", fieldtype: "Currency",
                label: __("Light System Price"),
            });
            // Read the picked system's settings from the Amenity, not from the row:
            // used_lines and the pricing mode are written by the server, so the row still
            // carries the *previous* pick until the recalc lands.
            const $hint = hint($picker, () => {
                const system = (opts.light_systems || [])
                    .find((l) => l.system_name === this.row.light_system);
                if (system) {
                    return [
                        __("{0} of {1} lines", [cint(system.used_lines), cint(opts.lines)]),
                        system.pricing_mode || "",
                    ].filter(Boolean).join(" · ");
                }
                // Not configured on this amenity, so there is no line split to describe:
                // it covers everything at its own standard rate. An empty pick says which
                // way it will be resolved rather than reading as "no light system".
                return this.row.light_system
                    ? __("all {0} lines · standard rate", [cint(opts.lines)])
                    : __("default system · all {0} lines", [cint(opts.lines)]);
            });

            // What the server decided covered the rest. An output, not an input — there is
            // nothing in `opts` to compute it from, so it is read off the row, and it only
            // appears once a recalc has landed.
            const $fill = slot($line, "12rem");
            $(`<label class="control-label"></label>`).text(__("Default Fill")).appendTo($fill);
            const $fill_text = $(`
                <div style="height:28px;display:flex;align-items:center;font-size:.9em"></div>
            `).appendTo($fill);

            this.body_syncers.push(() => {
                const chosen = Boolean(this.row.light_system);
                $price.toggle(chosen);
                $hint.toggle(chosen);
                $device.toggle(Boolean(this.row.light_system_device));

                const filled = cint(this.row.default_system_lines);
                $fill.toggle(Boolean(this.row.default_system && filled));
                if (!filled) return;
                $fill_text.text(__("{0} · {1} lines · {2}", [
                    this.row.default_system,
                    filled,
                    format_currency(this.row.qtn_default_system_amount, this.frm.doc.currency),
                ]));
            });
        }

        if (has_sound) {
            const $line = add_on();
            const $toggle = slot($line, "9rem");
            // The box goes inside a real .control-label and the caption sits beside it, so
            // it lands on the label line by construction — it inherits the theme's own
            // label metrics instead of a measured or guessed offset. Nesting the input
            // inside the label is also what makes clicking the caption tick the box.
            const $caption = $(`
                <label class="control-label" style="display:flex;align-items:center;gap:.35rem;cursor:pointer"></label>
            `).appendTo($toggle);
            const $box = $(`<span style="display:inline-flex;align-items:center"></span>`).appendTo($caption);
            $caption.append(document.createTextNode(__("Sound System")));
            // bare: the caption beside the box is the label
            this.make_field($box, row, {
                fieldname: "has_sound_system", fieldtype: "Check", label: __("Sound System"),
            }, { bare: true });

            const $price = slot($line, "10rem");
            this.make_field($price, row, {
                fieldname: "qtn_sound_system_price", fieldtype: "Currency",
                label: __("Sound System Price"),
            });
            this.body_syncers.push(() => $price.toggle(Boolean(this.row.has_sound_system)));
        }

        if (has_floor) {
            const $line = add_on();
            const $price = slot($line, "10rem");
            this.make_field($price, row, {
                fieldname: "qtn_floor_price", fieldtype: "Currency", label: __("Floor Price"),
            });
            hint($price, () => __("across {0} floors", [cint(this.row.floor_qty)]));
        }

        // Frappe controls ship their own bottom margin, and a wrapped label would drop one
        // input a line below the rest — flatten both.
        $add_ons.find(".frappe-control, .form-group").css("margin-bottom", 0);
        $add_ons.find(".control-label").css("white-space", "nowrap");

        // A Check renders its disp-area, label-area, help and help-box whether or not they
        // hold anything, and `only_input` leaves them empty rather than removing them
        // (ControlCheck.set_input_areas just returns early). Empty or not they still take
        // part in layout, so the wrapper ends up taller than the box inside it and the
        // caption beside it centres against the wrapper — the box riding high. Collapse
        // them, drop the margins, and the box and its caption share one centre line.
        const $checks = $add_ons.find(".checkbox");
        $checks.css("margin", 0);
        $checks.find(".disp-area, .label-area, .help, .help-box").hide();
        $checks.find("label").css({ margin: 0, display: "flex", "align-items": "center" });
        $checks.find("input[type=checkbox]").css({ margin: 0, position: "static" });
    }

    render_annexes() {
        if (!this.annex_rows.length) {
            this.$body.append(`<div class="text-muted" style="font-size:.85em">${__("No annexes.")}</div>`);
            return;
        }
        const currency = this.frm.doc.currency;
        // Banded like the card's own head, and for the same reason Frappe bands
        // .grid-heading-row (common/grid.scss) — a header should read as a header. Both
        // use --subtle-accent, so both follow the theme into dark mode.
        const th = "background:var(--subtle-accent);color:var(--text-muted);font-weight:500;border-top:0";
        const $table = $(`
            <table class="table table-sm" style="margin:0">
                <thead><tr>
                    <th style="${th};width:30%">${__("Annex")}</th>
                    <th style="${th};width:14%">${__("Qty")}</th>
                    <th style="${th};width:18%">${__("UOM")}</th>
                    <th style="${th};width:20%">${__("Price")} <span class="text-muted">(${currency})</span></th>
                    <th style="${th};width:18%;text-align:right">${__("Amount")} <span class="text-muted">(${currency})</span></th>
                </tr></thead>
                <tbody></tbody>
            </table>
        `).appendTo(this.$body);
        const $tbody = $table.find("tbody");

        this.annex_rows.forEach((annex, index) => {
            // by index, not by object: sync re-reads locals, and the row it hands back on
            // the next recalc is a different object with the same docname
            const doc_of = () => this.annex_rows[index];

            const $tr = $(`
                <tr>
                    <td class="c-annex"></td>
                    <td class="c-qty"></td>
                    <td class="c-uom"></td>
                    <td class="c-price"></td>
                    <td class="c-amount" style="text-align:right;vertical-align:middle"></td>
                </tr>
            `).appendTo($tbody);

            $tr.find(".c-annex").text(annex.annex_name || annex.annex || "");

            const $amount = $tr.find(".c-amount");
            this.body_syncers.push(() =>
                $amount.text(format_currency(doc_of().qtn_annex_amount, currency)));

            // bare: the table header already names each column
            this.make_field($tr.find(".c-qty"), doc_of, {
                fieldname: "annex_quantity", fieldtype: "Float", label: __("Qty"),
            }, { bare: true });

            this.make_field($tr.find(".c-uom"), doc_of, {
                fieldname: "annex_uom", fieldtype: "Link", options: "UOM", label: __("UOM"),
                // the UOMs this annex's Item is actually convertible in
                get_query: () => ({
                    query: "butler.utils.queries.get_annex_uom_query",
                    filters: { annex: doc_of().annex },
                }),
            }, { bare: true });

            this.make_field($tr.find(".c-price"), doc_of, {
                fieldname: "qtn_annex_price", fieldtype: "Currency", label: __("Price"),
            }, { bare: true });
        });
    }

    // Composition belongs to the Facility Builder, price belongs to the quotation.
    //
    // A builder save replaces this whole table, so a composition edit made here would be
    // silently overwritten the next time anyone opened the canvas. carry_forward_overrides
    // protects the prices across that rebuild; it deliberately does not protect these,
    // because the layout is their source of truth. Locking them makes the split visible
    // instead of leaving a trap.
    static BUILDER_OWNED = new Set([
        "annex_quantity", "annex_uom", "light_system", "light_system_device",
        "has_sound_system",
    ]);

    // One editable control, bound to the model the way a grid cell is. `bare` drops the
    // label, for the annex table where the column header already names the field.
    make_field($slot, doc_of, df, { bare = false } = {}) {
        const doc = doc_of();

        // Start from the real docfield so the control inherits the field's own precision,
        // non_negative and permlevel instead of silently dropping them. Spread it rather
        // than editing it: frappe.meta.get_docfield returns the *shared* docfield object
        // when no docname is passed (model/meta.js), so a write would leak into list views
        // and report headers.
        df = { ...(frappe.meta.get_docfield(doc.doctype, df.fieldname) || {}), ...df };

        // A currency field resolves `options: "currency"` against its parent doc, which a
        // control mounted outside the form's layout doesn't have — so it would render
        // unformatted. Pass the literal code instead, the same thing amenity.js does for
        // its dialog, and put it in the label so the tier is readable at a glance.
        if (df.fieldtype === "Currency") {
            const code = df.fieldname.startsWith("qtn_")
                ? this.frm.doc.currency
                : doc.amenity_currency || this.frm.doc.currency;
            df = { ...df, options: code, label: `${df.label} (${code})` };
        }

        const builder_owned = AmenityCard.BUILDER_OWNED.has(df.fieldname);
        const control = frappe.ui.form.make_control({
            parent: $slot.get(0),
            df: {
                ...df,
                read_only: this.frm.doc.docstatus !== 0 || builder_owned,
                description: builder_owned ? __("Set in the Facility Builder") : df.description,
                // `change` is the control-agnostic hook: every control routes an edit
                // through validate_and_set_in_model, which calls it. A DOM "change"
                // listener only catches typed fields — a Link picked from its dropdown
                // goes through parse_validate_and_set_in_model and fires none.
                //
                // No guard is needed here. The control owns the write (set_model_value →
                // frappe.model.set_value, which marks the form dirty and fires the Butler
                // Quotation Item triggers), and validate_and_set_in_model already returns
                // early when the value hasn't changed — so this runs on real edits only.
                change: () => {
                    this.sync();              // reveal whatever this field governs, now
                    this.editor.on_change();  // and ask the server for the new numbers
                },
            },
            render_input: true,
            only_input: bare,
            frm: this.frm,
            doc,
            doctype: doc.doctype,
            docname: doc.name,
            value: doc[df.fieldname],
        });

        // Rule 4: refresh() re-reads frappe.model.get_value and repaints the input, with
        // no write chain and no df.change — which is why syncing can never be mistaken for
        // an edit. (set_value could: a Currency control rounds on the way out, so a stored
        // 106.666… came back 106.67 and read as a change, and every repaint recalculated.)
        this.body_syncers.push(() => {
            const current = doc_of();
            control.doc = current;
            control.docname = current.name;
            control.refresh();
        });

        // a bare control lost its label, so name it in the placeholder — except a Check,
        // which is a box with nothing to write a placeholder into
        if (bare && df.fieldtype !== "Check") {
            control.$input && control.$input.attr("placeholder", df.label);
        }
        if (builder_owned) {
            control.$input && control.$input.attr("title", __("Set in the Facility Builder"));
        }
        return control;
    }
};
