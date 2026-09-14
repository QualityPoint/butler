// The Butler Quotation line editor.
//
// `Butler Quotation.amenities` holds two row types — an amenity row and the annex rows
// beneath it (see docs/quotation_pricing/annexes.md). A stock grid can't express that: it
// would show one flat list of 88-column rows where most fields are blank for whichever
// type the row isn't. So the table is hidden + read-only and rendered here instead,
// grouped floor → amenity → annexes, showing each row only the fields it actually owns.
//
// It is still a child-table editor, though, so it follows the four rules
// frappe.ui.form.Grid / GridRow are built on rather than inventing its own:
//
//   1. Rows persist.  Grid.render_result_rows reuses the GridRow already rendered for a
//      doc, builds one only for a doc it hasn't seen, removes the stale ones and reorders
//      the DOM from the first mismatch — it never empties the container.
//      Here: AmenitiesEditor.render keeps `cards`, a docname → AmenityCard map, the way
//      the grid keeps grid_rows_by_docname.
//
//   2. Opening a row touches only that row.  GridRow.toggle_view builds its GridRowForm
//      once and then shows or hides it; no sibling is redrawn.
//      Here: AmenityCard.toggle builds its body on first open and only toggles it after.
//      Nothing that merely reveals a field re-renders any more either — a price that
//      appears when its box is ticked is built up front and shown by sync, which is what
//      a docfield's depends_on does.
//
//   3. A control is built once and then kept.  GridRow.make_control opens with
//      `if (column.field) return;` — a cell that already has a control is never given a
//      second one.
//      Here: the annex cells are built when the card is first opened and live for as long
//      as the card does. Frappe goes further and builds no control at all until a cell is
//      clicked (each column carries a static_area of plain text beside a hidden
//      field_area), which is how a 50-row grid avoids building 250 controls. This editor
//      deliberately doesn't: an open card holds a handful of annex rows, and hiding their
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

// Bumped whenever this file changes, so a stale bundle can be identified from the browser
// console rather than guessed at: butler.ui.AmenitiesEditor.BUILD
butler.ui.AmenitiesEditor = class AmenitiesEditor {
    static BUILD = "2026-09-09-grouped";

    constructor(wrapper, frm, { on_change } = {}) {
        this.$wrapper = $(wrapper);
        this.frm = frm;
        this.on_change = on_change || (() => { });
        this.expanded = new Set();   // amenity row names whose annexes are open
        this.options = {};           // amenity name -> what that Amenity offers
        this.cards = new Map();      // amenity row docname -> AmenityCard  (≈ grid_rows_by_docname)
        this.tab_syncers = [];
        this.heading_syncers = [];
        this.active_floor = null;    // one floor shown at a time, like the Facility Builder
        this.group_by_amenity = false;
        this.headings = new Map();   // amenity -> its heading node, kept the way cards are
        this.collapsed = new Set();  // amenity names folded away under their heading
    }

    // Group the flat table the way the server does (group_amenity_rows): every row
    // carries the `placement_id` of the drawn amenity it belongs to, so an amenity row
    // opens a group and each annex row joins the one it names. Row order no longer
    // decides anything — two placements of one amenity on one floor are simply two
    // groups, which is the normal case now rather than the exception.
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
        const names = [...new Set((this.frm.doc.amenities || []).map((r) => r.amenity).filter(Boolean))];
        // What an Amenity offers doesn't change while a quotation is being edited, so
        // only ask about ones we haven't seen — a full refresh then costs no round trip
        // at all once the cache is warm.
        const unknown = names.filter((name) => !(name in this.options));
        if (!unknown.length) {
            this.render();
            return Promise.resolve();
        }
        return frappe
            .xcall("butler.butler.doctype.butler_quotation.butler_quotation.get_amenity_options",
                { amenities: unknown })
            .then((options) => {
                Object.assign(this.options, options || {});
                this.render();
            });
    }

    // Rule 1 — reuse the cards already on screen; create, retire and reorder around them.
    // Nothing is emptied, so a card that is open and mid-edit stays open and mid-edit.
    render() {
        const groups = this.get_groups();
        this.make_skeleton();

        this.$empty.toggle(!groups.length);
        this.$root.toggle(groups.length > 0);
        if (!groups.length) {
            this.retire_cards(new Set());
            this.retire_headings(new Set());
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
        this.paint_group_toggle();

        // Only the active floor's cards exist, the way a grid only builds its current
        // page (Grid.render_result_rows honours grid_pagination). Switching floors is
        // navigation, not an edit, so rebuilding there is fair; `expanded` lives on the
        // editor, so which amenities are open survives the switch.
        const shown = floors.get(this.active_floor) || [];
        const keep = new Set();
        for (const group of shown) {
            // keyed by placement, not docname: a Facility Builder save replaces the whole
            // child table, so docnames churn and every card would be torn down and rebuilt
            const name = group.amenity_row.placement_id;
            keep.add(name);
            const card = this.cards.get(name);
            if (card) card.refresh(group);
            else this.cards.set(name, new butler.ui.AmenityCard({ editor: this, group }));
        }
        this.retire_cards(keep);
        this.reorder(this.lay_out(shown));

        this.sync();
    }

    // What the panel should contain, in order: the cards on their own, or each amenity's
    // run of placements behind a heading. `shown` already arrives clustered — the server's
    // order_amenity_rows keeps every placement of one amenity together — so a run is just
    // consecutive groups with the same amenity, no sorting needed here.
    lay_out(shown) {
        this.heading_syncers = [];
        const node_of = (group) => this.cards.get(group.amenity_row.placement_id).$card;

        if (!this.group_by_amenity) {
            this.retire_headings(new Set());
            return shown.map((group) => node_of(group).show().get(0));
        }

        const runs = new Map();
        for (const group of shown) {
            const amenity = group.amenity_row.amenity || __("Unassigned");
            if (!runs.has(amenity)) runs.set(amenity, []);
            runs.get(amenity).push(group);
        }

        const nodes = [];
        for (const [amenity, groups] of runs) {
            nodes.push(this.heading(amenity, groups));
            const folded = this.collapsed.has(amenity);
            for (const group of groups) nodes.push(node_of(group).toggle(!folded).get(0));
        }
        this.retire_headings(new Set(runs.keys()));
        return nodes;
    }

    // One heading per amenity, kept across renders for the same reason cards are: it holds
    // the fold state, and rebuilding it would make the panel flicker on every recalc.
    heading(amenity, groups) {
        let $heading = this.headings.get(amenity);
        if (!$heading) {
            $heading = $(`
                <div class="butler-amenity-group" style="
                    display:flex;align-items:center;gap:.5rem;cursor:pointer;
                    margin:.75rem 0 .35rem;padding-bottom:.25rem;
                    border-bottom:1px solid var(--border-color)">
                    <span class="butler-group-caret" style="width:1rem;color:var(--text-muted)"></span>
                    <span class="butler-group-name" style="font-weight:600"></span>
                    <span class="butler-group-count" style="font-size:var(--text-xs);border-radius:8px;
                        padding:0 6px;background:var(--subtle-accent);color:var(--text-muted)"></span>
                    <span class="butler-group-total" style="margin-left:auto;font-weight:600"></span>
                </div>
            `);
            $heading.on("click", () => {
                if (this.collapsed.has(amenity)) this.collapsed.delete(amenity);
                else this.collapsed.add(amenity);
                this.render();
            });
            this.headings.set(amenity, $heading);
        }

        const folded = this.collapsed.has(amenity);
        $heading.find(".butler-group-caret").text(folded ? "▸" : "▾"); // as the cards do
        $heading.find(".butler-group-name").text(__(amenity));
        $heading.find(".butler-group-count").text(groups.length);

        const $total = $heading.find(".butler-group-total");
        const rows = groups.map((g) => g.amenity_row);
        const currency = this.frm.doc.currency;
        this.heading_syncers.push(() =>
            $total.text(format_currency(
                rows.reduce((sum, r) => sum + flt(live(r).qtn_amenity_amount), 0), currency))
        );

        return $heading.get(0);
    }

    retire_headings(keep) {
        for (const [amenity, $heading] of this.headings) {
            if (keep.has(amenity)) continue;
            $heading.remove();
            this.headings.delete(amenity);
        }
    }

    // Built once and kept: the tabs and the panel outlive every render.
    make_skeleton() {
        if (this.$root) return;
        this.$root = $(`<div class="butler-lines"></div>`).appendTo(this.$wrapper);
        // The floors take the width they need and scroll sideways when there are more
        // than fit; the toggle keeps its place at the far end rather than being pushed
        // off with them.
        const $bar = $(`
            <div class="butler-floor-bar" style="display:flex;align-items:center;gap:8px;
                border-bottom:1px solid var(--border-color);padding-bottom:6px"></div>
        `).appendTo(this.$root);
        this.$tabs = $(`
            <div class="butler-floor-tabs" style="display:flex;gap:4px;flex:1;min-width:0;
                overflow-x:auto;scrollbar-width:thin;padding-bottom:2px"></div>
        `).appendTo($bar);
        this.$group_toggle = $(`
            <button type="button" class="butler-group-toggle" style="
                flex-shrink:0;white-space:nowrap;cursor:pointer;
                border-radius:var(--border-radius);padding:4px 10px;font-size:var(--text-sm)">
                ${__("Group By Amenity")}
            </button>
        `).appendTo($bar);
        this.$group_toggle.on("click", () => {
            this.group_by_amenity = !this.group_by_amenity;
            this.render();
        });
        this.$panel = $(`
            <div class="butler-floor-panel" style="padding-top:.75rem"></div>
        `).appendTo(this.$root);
        this.$empty = $(`
            <div class="text-muted" style="padding:1rem 0">${__("No amenities yet.")}</div>
        `).appendTo(this.$wrapper);
    }

    retire_cards(keep) {
        for (const [name, card] of this.cards) {
            if (keep.has(name)) continue;
            card.destroy();
            this.cards.delete(name);
        }
    }

    // Move only what actually moved. jQuery's append() on an attached node detaches and
    // reinserts it, which drops focus and closes any open picker — so, like
    // Grid.render_result_rows, reorder from the first mismatch and leave the rest alone.
    reorder(wanted) {
        const current = this.$panel.children().get();

        let from = -1;
        for (let i = 0; i < wanted.length; i++) {
            if (current[i] !== wanted[i]) {
                from = i;
                break;
            }
        }
        if (from === -1) return;
        for (let i = from; i < wanted.length; i++) this.$panel.append(wanted[i]);
    }

    // Rule 4 — push the model's values back into the controls that already exist. A live
    // recalc only changes numbers; it never reshapes rows (that happens in before_validate,
    // on save), so nothing has to be rebuilt to show its result.
    sync() {
        for (const syncer of this.tab_syncers) syncer();
        for (const syncer of this.heading_syncers) syncer();
        for (const card of this.cards.values()) card.sync();
    }

    // The same treatment the active floor tab gets, so "grouped" reads as a state rather
    // than as a button you press each time.
    paint_group_toggle() {
        const on = this.group_by_amenity;
        this.$group_toggle.css({
            border: `1px solid ${on ? "var(--btn-primary, #1f272e)" : "var(--border-color)"}`,
            background: on ? "var(--btn-primary, #1f272e)" : "var(--card-bg, #fff)",
            color: on ? "var(--bg-color, #fff)" : "inherit",
            "font-weight": on ? 600 : 400,
        });
        this.$group_toggle.attr("aria-pressed", on ? "true" : "false");
    }

    // One floor at a time, switched by a tab — the same model the Facility Builder uses
    // (FloorTabs.vue), so the two views of the same quotation behave alike. Each tab
    // carries its floor's amenity count and total, so switching is never blind. Tabs hold
    // no controls, so redrawing them costs nothing worth saving.
    render_floor_tabs(floors) {
        this.$tabs.empty();
        this.tab_syncers = [];
        const currency = this.frm.doc.currency;

        for (const [floor, groups] of floors) {
            const active = floor === this.active_floor;
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
                    <span style="font-size:var(--text-xs);border-radius:8px;padding:0 6px;
                        background:${active ? "rgba(255,255,255,.18)" : "var(--subtle-fg,#eef)"}">
                        ${groups.length}
                    </span>
                    <span class="butler-tab-total" style="font-size:var(--text-xs);opacity:${active ? ".8" : ".65"}"></span>
                </button>
            `).appendTo(this.$tabs);

            $tab.find(".butler-tab-name").text(floor);
            $tab.on("click", () => {
                this.active_floor = floor;
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

// One amenity and the annexes under it — this editor's GridRow. It owns its DOM from the
// moment it is built until it is retired, and every update it takes is in place.
// The alias chip in the card head. `--bg-blue`/`--text-on-blue` rather than a grey: the
// head is already tinted with --subtle-accent, so a grey chip would barely separate from
// it, and both vars are redefined under dark mode, so the pair inverts on its own.
//
// It shrinks before the amenity name does (min-width:0 here, nowhere on the name) and
// ellipsizes, so a long alias can never push the annex count or the amount off the row.
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
        this.toggle(editor.expanded.has(this.row.placement_id));
    }

    // Identifies the *shape* of the annex list, not its values — the body's table only has
    // to be rebuilt when the rows themselves change, which happens in before_validate on
    // save. JSON, not a joined string, for the same reason get_groups uses it.
    static key(annex_rows) {
        return JSON.stringify(annex_rows.map((r) => r.name));
    }

    make() {
        this.$card = $(`
            <div class="butler-amenity" style="border:1px solid var(--border-color);border-radius:var(--border-radius-md);margin-bottom:.5rem;background:var(--card-bg)">
                <div class="butler-amenity-head" style="display:flex;align-items:center;gap:.75rem;padding:.5rem .75rem;cursor:pointer;background:var(--subtle-accent)">
                    <span class="butler-caret" style="width:1rem;color:var(--text-muted)"></span>
                    <span style="flex:1;min-width:0;display:flex;align-items:baseline;gap:.4rem">
                        <span class="butler-amenity-name" style="font-weight:500;white-space:nowrap"></span>
                        <span class="butler-amenity-alias" style="${ALIAS_CHIP}"></span>
                    </span>
                    <span class="butler-annex-count text-muted" style="font-size:.85em"></span>
                    <span class="butler-amount" style="min-width:8rem;text-align:right;font-weight:600"></span>
                </div>
                <div class="butler-amenity-body" style="display:none;border-top:1px solid var(--border-color);padding:.75rem"></div>
            </div>
        `).appendTo(this.editor.$panel);

        this.$body = this.$card.find(".butler-amenity-body");

        const $head = this.$card.find(".butler-amenity-head");
        const $caret = this.$card.find(".butler-caret");
        const $name = this.$card.find(".butler-amenity-name");
        const $alias = this.$card.find(".butler-amenity-alias");
        const $count = this.$card.find(".butler-annex-count");
        const $amount = this.$card.find(".butler-amount");

        this.head_syncers.push(() => {
            // Closed, the head *is* the card, so it carries the card's full radius; open,
            // only its top corners are round and the body squares off the bottom. Done
            // here rather than with overflow:hidden on the card, which would clip the
            // annex rows' link pickers where they drop below the card's edge.
            const radius = "var(--border-radius-md)";
            $head.css("border-radius", this.open ? `${radius} ${radius} 0 0` : radius);
            $caret.text(this.open ? "▾" : "▸");
            $name.text(this.row.amenity || __("(no amenity)"));
            // The customer's own name for this one placement, beside the amenity's. Shown
            // only where it is genuinely an override: `fetch_if_empty` seeds the row with
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

        $head.on("click", (e) => {
            if ($(e.target).closest(".control-input, input, select, a").length) return;
            this.toggle(!this.open);
        });
    }

    // Rule 2 — the body is built on first open and only shown or hidden afterwards. No
    // other card hears about it, and this one is never torn down.
    toggle(open) {
        this.open = open;
        if (open) this.editor.expanded.add(this.row.placement_id);
        else this.editor.expanded.delete(this.row.placement_id);

        if (open && !this.built) this.build_body();
        this.$body.toggle(open);
        this.sync();
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

    // Only the add-ons this Amenity actually configures — a light-system picker when it
    // has light systems, a sound toggle when it carries a sound price, a floor extra when
    // it is floor-dependent. Anything else would be a control that can never do anything.
    render_add_ons(opts) {
        // A light system is always fitted now — an amenity that configures none still gets
        // the default, priced from the master across all its lines — so unlike sound and
        // the floor extra this is never absent.
        const has_light = true;
        const has_sound = flt(opts.sound_system_price) > 0;
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
        "annex_quantity", "annex_uom", "light_system", "has_sound_system",
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
