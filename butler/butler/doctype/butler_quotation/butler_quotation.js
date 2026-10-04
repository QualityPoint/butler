// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt

frappe.ui.form.on("Butler Quotation", {
    setup(frm) {
        // Restrict Quotation To to the party types Butler supports (mirrors
        // ERPNext's Quotation, minus CRM Deal which Butler doesn't map).
        frm.set_query("quotation_to", () => ({
            filters: { name: ["in", ["Customer", "Lead"]] },
        }));

        // Lead party uses ERPNext's richer lead search; Customer/Prospect use
        // the default link query.
        frm.set_query("party_name", () => {
            if (frm.doc.quotation_to === "Lead") {
                return { query: "erpnext.controllers.queries.lead_query" };
            }
        });

        frm.set_query("bundle_type", () => {
            return {
                filters: {
                    disabled: 0
                },
            };
        });

        // Tax template picker → the company's enabled Sales Taxes and Charges Templates.
        frm.set_query("taxes_and_charges", () => ({
            filters: { company: frm.doc.company, disabled: 0 },
        }));

        // Taxes grid (Sales Taxes and Charges): mirror ERPNext accounts.js — filter
        // account_head to the company's tax/chargeable/expense accounts and cost_center
        // to the company; rate-vs-tax_amount mandatory follows charge_type.
        frm.set_query("account_head", "taxes", (doc) => ({
            query: "erpnext.controllers.queries.tax_account_query",
            filters: {
                account_type: ["Tax", "Chargeable", "Expense Account"],
                company: doc.company,
            },
        }));
        frm.set_query("cost_center", "taxes", (doc) => ({
            filters: { company: doc.company, is_group: 0 },
        }));
        $(frm.wrapper).on("grid-row-render", (e, grid_row) => {
            if (grid_row.doc && grid_row.doc.doctype === "Sales Taxes and Charges") {
                set_tax_row_mandatory(grid_row);
            }
        });

        // Filter the billing Address and Contact to those linked to the selected
        // party, via its Dynamic Links (same endpoints ERPNext uses).
        frm.set_query("customer_address", () =>
            party_link_query(frm, "frappe.contacts.doctype.address.address.address_query")
        );
        frm.set_query("contact_person", () =>
            party_link_query(frm, "frappe.contacts.doctype.contact.contact.contact_query")
        );

        // Company address is filtered to the company's own addresses.
        frm.set_query("company_address", () => {
            if (!frm.doc.company) {
                frm.scroll_to_field("company");
                frappe.show_alert({
                    message: __("Please set {0} first.", [__("Company")]),
                    indicator: "orange",
                });
            }
            return {
                query: "frappe.contacts.doctype.address.address.address_query",
                filters: { link_doctype: "Company", link_name: frm.doc.company || "" },
            };
        });
    },

    onload_post_render(frm) {
        // Auto-load the company's default tax template on a brand-new quotation, before
        // any party is picked — mirrors ERPNext transaction.js `onload_post_render` ->
        // `apply_default_taxes`. Skipped once the taxes table already has rows (e.g. an
        // amended doc, or apply_default_taxes already ran via the `company` trigger).
        if (frm.doc.__islocal && !(frm.doc.taxes || []).length) {
            frappe.after_ajax(() => apply_default_taxes(frm));
        }
    },

    onload(frm) {
        frm.trigger("set_dynamic_link");
        frm.trigger("set_dynamic_field_label");

        if (!frm.is_new()) return;

        // Default the company like ERPNext: user/session default, then the
        // Global Defaults default company. (The server resolves it too, but
        // setting it here keeps the reqd field from blocking the form.)
        if (!frm.doc.company) {
            const company =
                frappe.defaults.get_user_default("Company") ||
                frappe.defaults.get_global_default("company");
            if (company) frm.set_value("company", company);
        }

        // Default valid_till like ERPNext: transaction_date + Butler Settings
        // "Default Quotation Validity Days", falling back to +1 month.
        if (!frm.doc.valid_till && frm.doc.transaction_date) {
            frappe.db
                .get_single_value("Butler Settings", "default_valid_till")
                .then((days) => {
                    if (frm.doc.valid_till) return;
                    days = cint(days);
                    frm.set_value(
                        "valid_till",
                        days
                            ? frappe.datetime.add_days(frm.doc.transaction_date, days)
                            : frappe.datetime.add_months(frm.doc.transaction_date, 1)
                    );
                });
        }
    },

    refresh(frm) {
        frm.trigger("set_dynamic_link");
        frm.trigger("set_label");
        frm.trigger("set_dynamic_field_label");
        frm.trigger("toggle_currency_fields");
        render_amenities_editor(frm);

        // A template was picked but the schedule is empty (e.g. a doc saved before this
        // field existed) — mirrors ERPNext's transaction.js refresh safeguard.
        if (
            frm.docstatus < 2 &&
            frm.doc.payment_terms_template &&
            !(frm.doc.payment_schedule || []).length
        ) {
            frm.trigger("payment_terms_template");
        }

        if (frm.is_new()) return; // need a saved quotation to attach geometry to
        frm.add_custom_button(__("Open Facility Builder"), () => {
            // pin the desk sidebar — the builder's <mode>/<name> sub-route can't be
            // resolved to a Workspace Sidebar by Frappe's route→sidebar matcher
            frappe.route_options = { sidebar: "Smart Homes" };
            frappe.set_route("facility-builder", "quotation", frm.doc.name);
        });

        // Put chosen amenities back to their masters: details, prices, annexes, light &
        // sound. docs/legacy_quotations.md
        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__("Reset Amenity"), () => reset_amenity_dialog(frm));
        }

        // Create -> Sales Order (Amenities and Bundle orders, while submitted and
        // not fully ordered/lost/cancelled).
        if (
            frm.doc.docstatus === 1 &&
            ["Amenities", "Bundle"].includes(frm.doc.order_type) &&
            !["Ordered", "Lost", "Cancelled"].includes(frm.doc.status)
        ) {
            frm.add_custom_button(
                __("Sales Order"),
                () => {
                    frappe.model.open_mapped_doc({
                        method: "butler.butler.doctype.butler_quotation.butler_quotation.make_sales_order",
                        frm: frm,
                    });
                },
                __("Create")
            );
            frm.page.set_inner_btn_group_as_primary(__("Create"));
        }

        // Set as Lost — mirrors ERPNext Quotation behaviour.
        if (
            frm.doc.docstatus === 1 &&
            !["Lost", "Ordered", "Cancelled"].includes(frm.doc.status) &&
            frm.has_perm("write")
        ) {
            frm.add_custom_button(__("Set as Lost"), () => {
                frm.trigger("set_as_lost_dialog");
            });
        }
    },

    set_as_lost_dialog(frm) {
        const dialog = new frappe.ui.Dialog({
            title: __("Set as Lost"),
            fields: [
                {
                    fieldtype: "Table MultiSelect",
                    label: __("Lost Reasons"),
                    fieldname: "lost_reason",
                    options: "Quotation Lost Reason Detail",
                    reqd: 1,
                },
                {
                    fieldtype: "Table MultiSelect",
                    label: __("Competitors"),
                    fieldname: "competitors",
                    options: "Competitor Detail",
                },
                {
                    fieldtype: "Small Text",
                    label: __("Detailed Reason"),
                    fieldname: "detailed_reason",
                },
            ],
            primary_action_label: __("Declare Lost"),
            primary_action(values) {
                frm.call({
                    doc: frm.doc,
                    method: "declare_enquiry_lost",
                    args: {
                        lost_reasons_list: values.lost_reason,
                        competitors: values.competitors || [],
                        detailed_reason: values.detailed_reason,
                    },
                    callback(r) {
                        if (!r.exc) {
                            dialog.hide();
                            frm.reload_doc();
                        }
                    },
                });
            },
        });
        dialog.show();
    },

    order_type(frm) {
        // The Bundle config only applies to a Bundle order. Switching away clears
        // bundle_type, whose handler in turn empties the breakup + pricing; switching
        // to it re-syncs everything for whatever bundle is already set.
        if (frm.doc.order_type !== "Bundle") {
            frm.set_value("bundle_type", null);
        } else {
            frm.trigger("bundle_type");
        }
    },

    bundle_type(frm) {
        populate_bundle_items(frm);
        set_bundle_pricing(frm);
        recalculate_quotation(frm);
    },

    // frappe.dynamic_link points the address/contact link queries at the party.
    set_dynamic_link(frm) {
        frappe.dynamic_link = {
            doc: frm.doc,
            fieldname: "party_name",
            doctype: frm.doc.quotation_to,
        };
    },

    quotation_to(frm) {
        frm.trigger("set_dynamic_link");
        frm.trigger("set_label");
        frm.trigger("set_dynamic_field_label");
        // The party type changed, so any resolved name is no longer valid.
        // (party_name itself is kept, mirroring ERPNext.)
        frm.set_value("customer_name", "");
    },

    party_name(frm) {
        frm.trigger("set_dynamic_link");

        if (!frm.doc.party_name) {
            frm.set_value({
                customer_name: "",
                customer_address: "",
                customer_address_display: "",
                contact_person: "",
                contact_display: "",
                contact_mobile: "",
                contact_email: "",
                payment_terms_template: "",
            });
            return;
        }

        frappe.call({
            method: "butler.butler.doctype.butler_quotation.butler_quotation.get_party_details",
            args: {
                party_name: frm.doc.party_name,
                quotation_to: frm.doc.quotation_to,
                company: frm.doc.company,
            },
            callback(r) {
                if (!r.message) return;
                // Guard the address/contact triggers from firing mid-update,
                // exactly like ERPNext's updating_party_details flag.
                frm.updating_party_details = true;
                frappe.run_serially([
                    () => frm.set_value(r.message),
                    () => {
                        frm.updating_party_details = false;
                    },
                    // party (and its billing address) changed → re-resolve the tax template
                    () => set_taxes_from_tax_category(frm),
                ]);
            },
        });
    },

    customer_address(frm) {
        erpnext.utils.get_address_display(
            frm,
            "customer_address",
            "customer_address_display"
        );
    },

    contact_person(frm) {
        erpnext.utils.get_contact_details(frm);
    },

    company(frm) {
        // Default the company's billing address, mirroring ERPNext's
        // set_default_company_address (keeps an existing valid one).
        if (!frm.doc.company) {
            frm.set_value("company_address", "");
            return;
        }
        frappe.call({
            method: "erpnext.setup.doctype.company.company.get_default_company_address",
            args: {
                name: frm.doc.company,
                existing_address: frm.doc.company_address || "",
            },
            debounce: 2000,
            callback(r) {
                frm.set_value("company_address", r.message || "");
            },
        });
        apply_default_taxes(frm); // company changed -> its default tax template may differ
        frm.trigger("toggle_currency_fields"); // company currency may have changed
    },

    currency(frm) {
        // Document currency changed → recalc rebuilds the exchange_rates table; the row
        // for the new currency carries its (document→company) rate.
        frm.trigger("toggle_currency_fields");
        recalculate_quotation(frm);
    },

    toggle_currency_fields(frm) {
        // Mirror ERPNext (transaction.js change_form_labels / toggle_item_grid_columns),
        // generalised: company-currency (base_*) fields show only when SOME currency in
        // play differs from the company's (quotation, bundle, or any amenity) — when all
        // are equal there's nothing to convert, so they stay hidden. net_total /
        // additional_net_total show only when a document discount applies; the
        // exchange_rates table shows whenever it has rows.
        if (!frm.doc.company) return;
        get_company_currency(frm).then((company_currency) => {
            const multi = is_multi_currency(frm, company_currency);
            const has_discount = !!(frm.doc.discount_mode && flt(frm.doc.discount_amount));

            frm.toggle_display(BASE_CURRENCY_HEADER_FIELDS, multi);
            frm.toggle_display("exchange_rates", (frm.doc.exchange_rates || []).length > 0);
            frm.toggle_display(NET_TOTAL_FIELDS, has_discount);
            frm.toggle_display(BASE_NET_TOTAL_FIELDS, has_discount && multi);

            for (const [table, fields] of Object.entries(BASE_CURRENCY_GRID_FIELDS)) {
                const grid = frm.fields_dict[table] && frm.fields_dict[table].grid;
                if (!grid) continue;
                fields.forEach((f) => {
                    if (frappe.meta.get_docfield(grid.doctype, f)) {
                        grid.set_column_disp(f, multi);
                    }
                });
            }

            set_currency_field_labels(frm, company_currency);
        });
    },

    company_address(frm) {
        erpnext.utils.get_address_display(
            frm,
            "company_address",
            "company_address_display"
        );
    },

    discount_mode(frm) {
        frm.trigger("toggle_currency_fields"); // net_total visibility depends on a discount
        recalculate_quotation(frm);
    },

    discount_amount(frm) {
        frm.trigger("toggle_currency_fields");
        recalculate_quotation(frm);
    },

    apply_discount_on(frm) {
        frm.trigger("toggle_currency_fields");
        recalculate_quotation(frm);
    },

    bundle_price(frm) {
        recalculate_quotation(frm);
    },

    disable_rounded_total(frm) {
        // stricter than ERPNext (whose own Quotation has no field trigger for this
        // either, so toggling it there sits stale until another field recalculates) —
        // Butler's rule is any pricing input change recalculates live.
        recalculate_quotation(frm);
    },

    tax_category(frm) {
        set_taxes_from_tax_category(frm);
    },

    taxes_and_charges(frm) {
        populate_taxes_from_template(frm);
    },

    tc_name(frm) {
        erpnext.utils.get_terms(frm.doc.tc_name, frm.doc, function (r) {
            if (r.message) frm.set_value("terms", r.message);
        });
    },

    payment_terms_template(frm) {
        // Reuses ERPNext's own whitelisted helper (accounts_controller.py) verbatim —
        // the exact call transaction.js makes for every ERPNext transaction — instead
        // of reimplementing the payment-terms expansion here.
        if (!frm.doc.payment_terms_template) return;
        frappe.call({
            method: "erpnext.controllers.accounts_controller.get_payment_terms",
            args: {
                terms_template: frm.doc.payment_terms_template,
                posting_date: frm.doc.transaction_date,
                grand_total: frm.doc.rounded_total || frm.doc.grand_total,
                base_grand_total: frm.doc.base_rounded_total || frm.doc.base_grand_total,
            },
            callback(r) {
                if (r.message && !r.exc) {
                    frm.set_value("payment_schedule", r.message);
                    get_company_currency(frm).then((company_currency) => {
                        set_currency_field_labels(frm, company_currency);
                    });
                }
            },
        });
    },

    facility(frm) {
        // Render the Facility's default linked Address into facility_address,
        // mirroring customer_address_display / company_address_display.
        // (facility_type & project_name are handled by their fetch_from.)
        if (!frm.doc.facility) {
            frm.set_value("facility_address", "");
            return;
        }
        frappe.call({
            method: "butler.butler.doctype.butler_quotation.butler_quotation.get_facility_address_display",
            args: { facility: frm.doc.facility },
            callback(r) {
                frm.set_value("facility_address", r.message || "");
            },
        });

        // Default the party from the facility's links (Customer wins over Lead) when the
        // quotation has none yet — mirrors the server's set_party_from_facility. Setting
        // quotation_to then party_name lets the party_name trigger fill address/contact.
        if (!frm.doc.party_name) {
            frappe.call({
                method: "butler.butler.doctype.butler_quotation.butler_quotation.get_facility_party_details",
                args: { facility: frm.doc.facility },
                callback(r) {
                    if (r.message && r.message.party_name) {
                        frm.set_value("quotation_to", r.message.quotation_to);
                        frm.set_value("party_name", r.message.party_name);
                    }
                },
            });
        }
    },

    set_label(frm) {
        frm.fields_dict.customer_address.set_label(
            __((frm.doc.quotation_to || "Customer") + " Address")
        );
    },

    set_dynamic_field_label(frm) {
        const label =
            { Customer: "Customer", Lead: "Lead", Prospect: "Prospect" }[
            frm.doc.quotation_to
            ] || "Party";
        frm.set_df_property("party_name", "label", label);
    },
});

// Fill the read-only Bundle Items breakup from the selected Bundle's per-category
// amenity allowance — the same server source of truth the Facility Builder uses.
// Instant on-form feedback; the server re-derives it authoritatively on save.
function populate_bundle_items(frm) {
    frm.clear_table("bundle_items");
    if (frm.doc.order_type !== "Bundle" || !frm.doc.bundle_type) {
        frm.refresh_field("bundle_items");
        return;
    }
    frappe
        .xcall("butler.butler.doctype.butler_bundle.butler_bundle.get_bundle_breakdown", {
            bundle: frm.doc.bundle_type,
        })
        .then((rows) => {
            (rows || []).forEach((r) => {
                const row = frm.add_child("bundle_items");
                row.amenity_category = r.amenity_category;
                row.amenity_count = r.amenity_count;
            });
            frm.refresh_field("bundle_items");
        });
}

// Seed the bundle pricing fields from the selected Bundle for instant feedback. On save
// the server converts default_bundle_price/bundle_price into the document currency (using
// the bundle currency's row in the exchange_rates table) and reseeds bundle_price for the
// changed bundle. Quotation-only.
function set_bundle_pricing(frm) {
    if (frm.doc.order_type !== "Bundle" || !frm.doc.bundle_type) {
        frm.set_value({ bundle_price: 0, default_bundle_price: 0, bundle_currency: null });
        return;
    }
    frappe.db
        .get_value("Butler Bundle", frm.doc.bundle_type, ["bundle_price", "currency"])
        .then((r) => {
            const v = r.message || {};
            frm.set_value({
                bundle_price: v.bundle_price || 0,
                default_bundle_price: v.bundle_price || 0,
                bundle_currency: v.currency || null,
            });
        });
}

// Company-currency (base_*) fields + the read-only rate mirrors, shown only in
// multi-currency. The editable source is the exchange_rates table, not these fields.
const BASE_CURRENCY_HEADER_FIELDS = [
    "base_total",
    "base_total_taxes_and_charges",
    "base_grand_total",
    "base_rounded_total",
    "base_rounding_adjustment",
    "base_discount_amount",
    "base_in_words",
    "base_bundle_price",
    "base_default_bundle_price",
    "base_additional_total",
];
// net_total / additional_net_total (and their base_* twins) are only meaningful when a
// document discount applies — otherwise they equal total / additional_total. Mirrors
// ERPNext's change_form_labels, which hides net_total unless there's a discount.
const NET_TOTAL_FIELDS = ["net_total", "additional_net_total"];
const BASE_NET_TOTAL_FIELDS = ["base_net_total", "base_additional_net_total"];
const BASE_CURRENCY_GRID_FIELDS = {
    amenities: [
        "qtn_exchange_rate",
        "base_exchange_rate",
        "base_amenity_price",
        "base_amenity_net_price",
        "base_amenity_amount",
        "base_amenity_net_amount",
        "base_annex_price",
        "base_annex_net_price",
        "base_annex_amount",
        "base_annex_net_amount",
        "base_light_system_price",
        "base_light_system_amount",
        "base_sound_system_price",
        "base_sound_system_amount",
        "base_floor_price",
        "base_floor_amount",
    ],
    taxes: ["base_tax_amount", "base_total", "base_tax_amount_after_discount_amount"],
    payment_schedule: ["base_payment_amount", "base_outstanding", "base_paid_amount"],
};

// Render the real currency code into Currency-field labels (ERPNext parity —
// transaction.js change_form_labels): fields with options "currency" → the document
// currency (e.g. "Total (USD)"); fields with options "Company:company:default_currency"
// → the company currency (e.g. "Total (SAR)", replacing the literal "(Company Currency)").
// Covers the header and the amenities / taxes / payment_schedule child grids.
function set_currency_field_labels(frm, company_currency) {
    butler.utils.set_currency_labels(
        frm,
        {
            currency: frm.doc.currency,
            "Company:company:default_currency": company_currency,
        },
        [null, "amenities", "taxes", "payment_schedule"]
    );

    // in_words / base_in_words are Data, not Currency, so the options-driven pass above
    // skips them — they'd otherwise sit next to each other both reading "In Words" with
    // no way to tell which currency each spells out. Named explicitly, the way ERPNext
    // labels its own non-Currency fields (transaction.js does this for totals_section).
    frm.set_currency_labels(["in_words"], frm.doc.currency);
    frm.set_currency_labels(["base_in_words"], company_currency);

    // exchange_rates table: name the rate column with the actual company currency, so
    // each row reads "<currency> → Rate to <SAR>" (the rate is to the company currency).
    const ex_grid = frm.fields_dict.exchange_rates && frm.fields_dict.exchange_rates.grid;
    if (ex_grid && company_currency) {
        ex_grid.update_docfield_property(
            "conversion_rate", "label", __("Rate to {0}", [company_currency]));
        ex_grid.refresh();
    }

    // repaint, the way ERPNext's set_dynamic_labels finishes and amenity.js already does
    frm.refresh_fields();
}

// True when ANY currency in play (the quotation, the bundle, or any amenity) differs
// from the company currency — i.e. some conversion is actually happening. When every
// currency equals the company's, there's nothing to convert, so the company-currency
// (base_*) fields stay hidden. (Document-level, not row-wise — one cheap pass.)
function is_multi_currency(frm, company_currency) {
    if (!company_currency) return false;
    const differs = (c) => !!c && c !== company_currency;
    if (differs(frm.doc.currency)) return true;
    if (frm.doc.order_type === "Bundle" && differs(frm.doc.bundle_currency)) return true;
    return (frm.doc.amenities || []).some((row) => differs(row.amenity_currency));
}

// Company default currency, cached on the form (mirrors erpnext.get_currency).
function get_company_currency(frm) {
    if (frm.__company_currency && frm.__company_currency_for === frm.doc.company) {
        return Promise.resolve(frm.__company_currency);
    }
    return frappe.db.get_value("Company", frm.doc.company, "default_currency").then((r) => {
        frm.__company_currency = (r.message || {}).default_currency;
        frm.__company_currency_for = frm.doc.company;
        return frm.__company_currency;
    });
}

// Live (no-save) recompute: runs ButlerQuotation.recalculate on the in-memory doc and
// syncs the amounts/totals back to the form, so editing a rate/qty/tax/discount updates
// the totals immediately (Butler has no JS calc mirror — the server is authoritative).
// Debounced so a burst of grid edits collapses to one call; guarded to the Butler
// Quotation form because the Sales Taxes and Charges child doctype is shared.
function recalculate_quotation(frm) {
    if (!frm || frm.doctype !== "Butler Quotation") return;
    clearTimeout(frm.__recalc_timer);
    frm.__recalc_timer = setTimeout(() => {
        frappe.call({
            doc: frm.doc,
            method: "recalculate",
            callback: () => {
                frm.refresh_fields();
                // the recalc may have just populated exchange_rates / changed the
                // discount → re-run the show/hide logic so the table (and net_total,
                // base_* fields) appears without waiting for a save.
                frm.trigger("toggle_currency_fields");
                // A live recalc only recomputes numbers — it never reshapes rows, which
                // happens in before_validate on save. So push the new values into the
                // existing controls rather than rebuilding every one of them.
                if (frm.amenities_editor) frm.amenities_editor.sync();
            },
        });
    }, 300);
}

// "Reset Amenity": choose which amenities (all, by amenity type, or individual ones) and what to reset.
function reset_amenity_dialog(frm) {
    if (frm.is_dirty()) {
        frappe.msgprint(__("Save the quotation before resetting amenities."));
        return;
    }
    const rooms = (frm.doc.amenities || []).filter((r) => !r.annex);
    const counts = {};
    for (const r of rooms) counts[r.amenity] = (counts[r.amenity] || 0) + 1;

    const dialog = new frappe.ui.Dialog({
        title: __("Reset Amenity"),
        fields: [
            {
                fieldname: "scope", fieldtype: "Select", label: __("Reset"), reqd: 1,
                options: [
                    { value: "all", label: __("All amenities") },
                    { value: "types", label: __("By amenity type") },
                    { value: "placements", label: __("Selected amenities") },
                ],
                default: "all",
            },
            {
                fieldname: "amenity_types", fieldtype: "MultiSelectList", label: __("Amenity types"),
                depends_on: "eval:doc.scope=='types'",
                get_data: (txt) => Object.keys(counts).sort()
                    .filter((a) => !txt || a.toLowerCase().includes(txt.toLowerCase()))
                    .map((a) => ({ value: a, label: frappe.utils.escape_html(__(a)), description: __("{0} amenities", [counts[a]]) })),
            },
            {
                fieldname: "placements", fieldtype: "MultiSelectList", label: __("Amenities"),
                depends_on: "eval:doc.scope=='placements'",
                get_data: (txt) => rooms
                    .map((r) => {
                        const alias = (r.alias || "").trim();
                        const label = [__(r.amenity), r.floor_type, alias && alias !== r.amenity ? alias : ""]
                            .filter(Boolean).join(" · ");
                        return { value: r.placement_id, label };
                    })
                    .filter((o) => !txt || o.label.toLowerCase().includes(txt.toLowerCase()))
                    .map((o) => ({ ...o, label: frappe.utils.escape_html(o.label), description: "" })),
            },
            { fieldtype: "Section Break", label: __("What to reset") },
            ...butler.reset_amenity_options(),
        ],
        primary_action_label: __("Reset"),
        primary_action(values) {
            const options = butler.picked_reset_options(values);
            if (!options.length) {
                frappe.msgprint(__("Choose what to reset."));
                return;
            }
            const args = { name: frm.doc.name, options };
            if (values.scope === "types") args.amenities = values.amenity_types || [];
            if (values.scope === "placements") args.placements = values.placements || [];
            if ((args.amenities || args.placements) && !(args.amenities || args.placements).length) {
                frappe.msgprint(__("Select the amenity types or amenities to reset."));
                return;
            }
            dialog.hide();
            frappe
                .call({
                    method: "butler.butler.doctype.butler_quotation.butler_quotation.reset_amenities",
                    args,
                    freeze: true,
                    freeze_message: __("Resetting amenities…"),
                })
                .then((r) => {
                    const res = r.message || {};
                    frm.reload_doc();
                    frappe.show_alert({
                        message: __("{0} amenities reset · Grand Total {1} → {2}", [
                            res.rooms || 0,
                            format_currency(res.old_total, frm.doc.currency),
                            format_currency(res.new_total, frm.doc.currency),
                        ]),
                        indicator: "green",
                    }, 8);
                });
        },
    });
    dialog.show();
}

// Mount the line editor into the `amenities_html` field. The `amenities` table itself is
// hidden and read-only — it holds two different row types that a flat grid can't present
// (see docs/quotation_pricing/annexes.md), so this renders it grouped floor → amenity →
// annexes instead. Mirrors how user.js mounts frappe.RoleEditor into roles_html.
function render_amenities_editor(frm) {
    const wrapper = frm.fields_dict.amenities_html && frm.fields_dict.amenities_html.wrapper;
    if (!wrapper) return;

    if (!frm.amenities_editor) {
        frm.amenities_editor = new butler.ui.AmenitiesEditor($("<div>").appendTo(wrapper), frm, {
            on_change: () => recalculate_quotation(frm),
        });
    }
    frm.amenities_editor.refresh();
}

// --- Amenity lines — recompute amount/totals on any pricing input change. ------------
frappe.ui.form.on("Butler Quotation Item", {
    amenity(frm, cdt, cdn) {
        // the amenity (and so its currency) changed → drop the stale per-row rates; the
        // server re-derives them from the exchange_rates table on recalc.
        frappe.model.set_value(cdt, cdn, "qtn_exchange_rate", null);
        frappe.model.set_value(cdt, cdn, "base_exchange_rate", null);
        recalculate_quotation(frm);
    },
    // the four Quotation Prices on a line, one per priced component (see
    // docs/quotation_pricing/reference.md: the three price tiers)
    qtn_annex_price: (frm) => recalculate_quotation(frm),
    qtn_light_system_price: (frm) => recalculate_quotation(frm),
    qtn_sound_system_price: (frm) => recalculate_quotation(frm),
    qtn_floor_price: (frm) => recalculate_quotation(frm),
    annex: (frm) => recalculate_quotation(frm),
    annex_quantity: (frm) => recalculate_quotation(frm),
    annex_uom: (frm) => recalculate_quotation(frm),
    light_system: (frm) => recalculate_quotation(frm),
    has_sound_system: (frm) => recalculate_quotation(frm),
    floor_type: (frm) => recalculate_quotation(frm),
    additional_amenity: (frm) => recalculate_quotation(frm),
    amenities_remove: (frm) => recalculate_quotation(frm),
    form_render(frm, cdt, cdn) {
        // ERPNext's set_column_disp hides only the collapsed grid COLUMNS — the expanded
        // row form reads a per-row CACHED docfield copy (frappe.meta.get_docfield_copy)
        // that the toggle can't reach. So hide the company-currency (base_*) + exchange
        // fields directly on the open row form when there's no conversion in play. Fires
        // only when a row is opened — no per-row scan cost.
        get_company_currency(frm).then((company_currency) => {
            const show = is_multi_currency(frm, company_currency);
            const grid_row = frm.fields_dict.amenities.grid.grid_rows_by_docname[cdn];
            const detail = grid_row && grid_row.grid_form;
            if (!detail) return;
            BASE_CURRENCY_GRID_FIELDS.amenities.forEach((f) => {
                const field = detail.fields_dict[f];
                if (!field) return;
                field.df.hidden = show ? 0 : 1;
                field.refresh();
                if (field.$wrapper) field.$wrapper.toggle(!!show); // belt-and-suspenders
            });
        });
    },
});

// Editing a currency's rate in the exchange_rates table (Currency Exchange Rate) re-prices
// everything in that currency (it's the single editable source for all conversion rates).
frappe.ui.form.on("Currency Exchange Rate", {
    conversion_rate: (frm) => recalculate_quotation(frm),
    form_render(frm, cdt, cdn) {
        // Per-row hint on the rate field, ERPNext-style: "1 EUR = [?] SAR" using this
        // row's currency and the company currency.
        const row = locals[cdt][cdn];
        get_company_currency(frm).then((company_currency) => {
            const grid_row = frm.fields_dict.exchange_rates.grid.grid_rows_by_docname[cdn];
            const field = grid_row && grid_row.grid_form && grid_row.grid_form.fields_dict.conversion_rate;
            if (field && row.currency && company_currency) {
                field.set_description(__("1 {0} = [?] {1}", [row.currency, company_currency]));
            }
        });
    },
});

// Picking a Payment Term directly on a Payment Schedule row (without a whole template) —
// reuses ERPNext's own whitelisted helper verbatim, same as transaction.js's payment_term.
frappe.ui.form.on("Payment Schedule", {
    payment_term(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        // condition fields are re-derived from the term below; stale values would
        // otherwise linger from whatever the row previously held.
        ["due_date_based_on", "credit_days", "credit_months",
            "discount_validity_based_on", "discount_validity"].forEach((field) => {
            row[field] = "";
        });
        if (!row.payment_term) return;

        frappe.call({
            method: "erpnext.controllers.accounts_controller.get_payment_term_details",
            args: {
                term: row.payment_term,
                posting_date: frm.doc.transaction_date,
                grand_total: frm.doc.rounded_total || frm.doc.grand_total,
                base_grand_total: frm.doc.base_rounded_total || frm.doc.base_grand_total,
            },
            callback(r) {
                if (r.message && !r.exc) {
                    Object.entries(r.message).forEach(([field, value]) => {
                        frappe.model.set_value(cdt, cdn, field, value);
                    });
                }
            },
        });
    },
});

// --- Taxes grid (Sales Taxes and Charges) — mirror of erpnext/public/js/controllers/
// accounts.js, scoped to the Butler Quotation form. ----------------------------------
frappe.ui.form.on("Sales Taxes and Charges", {
    account_head(frm, cdt, cdn) {
        const d = locals[cdt][cdn];
        if (d.docstatus == 1) return;
        if (!d.charge_type && d.account_head) {
            frappe.msgprint(__("Please select Charge Type first"));
            frappe.model.set_value(cdt, cdn, "account_head", "");
        } else if (d.account_head) {
            frappe.call({
                method: "erpnext.controllers.accounts_controller.get_tax_rate",
                args: { account_head: d.account_head },
                callback(r) {
                    if (!r.message) return;
                    if (d.charge_type !== "Actual") {
                        frappe.model.set_value(cdt, cdn, "rate", r.message.tax_rate || 0);
                    }
                    frappe.model.set_value(cdt, cdn, "description", r.message.account_name);
                },
            });
        }
    },
    charge_type(frm, cdt, cdn) {
        validate_tax_row(cdt, cdn);
        const grid_row = frm.fields_dict.taxes.grid.get_row(cdn);
        if (grid_row) set_tax_row_mandatory(grid_row);
        recalculate_quotation(frm);
    },
    rate(frm, cdt, cdn) {
        validate_tax_row(cdt, cdn);
        recalculate_quotation(frm);
    },
    tax_amount(frm, cdt, cdn) {
        validate_tax_row(cdt, cdn);
        recalculate_quotation(frm);
    },
    row_id(frm, cdt, cdn) {
        validate_tax_row(cdt, cdn);
        recalculate_quotation(frm);
    },
    included_in_print_rate(frm, cdt, cdn) {
        const d = locals[cdt][cdn];
        try {
            validate_tax_row(cdt, cdn);
            validate_inclusive_tax(d, frm);
        } catch (e) {
            d.included_in_print_rate = 0;
            refresh_field("included_in_print_rate", d.name, d.parentfield);
            throw e;
        }
        recalculate_quotation(frm);
    },
    taxes_remove(frm) {
        recalculate_quotation(frm);
    },
});

// rate is mandatory/editable for rate-based charge types; tax_amount for "Actual".
function set_tax_row_mandatory(grid_row) {
    const actual = grid_row.doc.charge_type === "Actual";
    grid_row.toggle_editable("tax_amount", actual);
    grid_row.toggle_reqd("tax_amount", actual);
    grid_row.toggle_editable("rate", !actual);
    grid_row.toggle_reqd("rate", !actual);
}

// Mirror of erpnext.accounts.taxes.validate_taxes_and_charges (charge_type ↔ row_id).
function validate_tax_row(cdt, cdn) {
    const d = locals[cdt][cdn];
    let msg = "";
    if (d.account_head && !d.description) {
        d.description = d.account_head.split(" - ").slice(0, -1).join(" - ");
    }
    if (!d.charge_type && (d.row_id || d.rate || d.tax_amount)) {
        msg = __("Please select Charge Type first");
        d.row_id = "";
        d.rate = d.tax_amount = 0.0;
    } else if (["Actual", "On Net Total", "On Paid Amount"].includes(d.charge_type) && d.row_id) {
        msg = __("Can refer row only if the charge type is 'On Previous Row Amount' or 'Previous Row Total'");
        d.row_id = "";
    } else if (["On Previous Row Amount", "On Previous Row Total"].includes(d.charge_type) && d.row_id) {
        if (d.idx == 1) {
            msg = __("Cannot select charge type as 'On Previous Row Amount' or 'On Previous Row Total' for first row");
            d.charge_type = "";
        } else if (d.row_id >= d.idx) {
            msg = __("Cannot refer row number greater than or equal to current row number for this Charge type");
            d.row_id = "";
        }
    }
    if (msg) {
        frappe.validated = false;
        refresh_field("taxes");
        frappe.throw(msg);
    }
}

// Mirror of erpnext.accounts.taxes.validate_inclusive_tax (accounts.js): what a row can
// legally be inclusive of — never Actual; "On Previous Row Amount/Total" require the
// referenced row(s) to also be inclusive; never a Valuation-category charge. Reverting
// the checkbox on failure is handled by the included_in_print_rate handler below.
function validate_inclusive_tax(tax, frm) {
    const on_previous_row_error = (row_range) => {
        frappe.throw(
            __("For row {0} in {1}. To include {2} in the total, rows {3} must also be included", [
                tax.idx, __(tax.doctype), tax.charge_type, row_range,
            ])
        );
    };

    if (!cint(tax.included_in_print_rate)) return;

    if (tax.charge_type === "Actual") {
        frappe.throw(__("Actual type tax cannot be included in the total in row {0}", [tax.idx]));
    } else if (
        tax.charge_type === "On Previous Row Amount" &&
        !cint(frm.doc.taxes[tax.row_id - 1].included_in_print_rate)
    ) {
        on_previous_row_error(tax.row_id);
    } else if (tax.charge_type === "On Previous Row Total") {
        const not_included = frm.doc.taxes
            .slice(0, tax.row_id)
            .some((t) => !cint(t.included_in_print_rate));
        if (not_included) {
            on_previous_row_error(tax.row_id == 1 ? "1" : "1 - " + tax.row_id);
        }
    } else if (tax.category === "Valuation") {
        frappe.throw(__("Valuation type charges can not be marked as Inclusive"));
    }
}

// Auto-load the company's default Sales Taxes and Charges Template — mirrors ERPNext's
// transaction.js `apply_default_taxes`. Fires on a brand-new quotation (before any party
// is picked, via onload_post_render) and again whenever `company` changes. A later
// tax_category/party change re-resolves the template via Tax Rule
// (set_taxes_from_tax_category), which simply overwrites whatever this loaded. Skipped
// when the taxes table already carries manually-added rows with no template attached —
// nothing to override in that case (ERPNext's own guard).
function apply_default_taxes(frm) {
    if (!frm.doc.taxes_and_charges && frm.doc.taxes && frm.doc.taxes.length > 0) return;

    const taxes_and_charges_field = frappe.meta.get_docfield(
        frm.doc.doctype, "taxes_and_charges", frm.doc.name
    );
    if (!taxes_and_charges_field) return;

    frappe.call({
        method: "erpnext.controllers.accounts_controller.get_default_taxes_and_charges",
        args: {
            master_doctype: taxes_and_charges_field.options,
            tax_template: frm.doc.taxes_and_charges || "",
            company: frm.doc.company,
        },
        debounce: 2000,
        callback(r) {
            if (r.exc || !r.message) return;
            // directly set in doc, so as not to re-trigger the taxes_and_charges handler
            // (populate_taxes_from_template) — the rows are already in r.message.taxes
            if (r.message.taxes_and_charges) {
                frm.doc.taxes_and_charges = r.message.taxes_and_charges;
            }
            if (r.message.taxes) {
                frm.set_value("taxes", r.message.taxes);
            }
            recalculate_quotation(frm);
        },
    });
}

// Resolve the Sales Taxes and Charges Template from tax_category (+ party, address,
// company, date) via Tax Rule — ERPNext's erpnext.accounts.party.set_taxes. Setting
// taxes_and_charges then populates the taxes table (see taxes_and_charges handler).
function set_taxes_from_tax_category(frm) {
    if (frm.updating_party_details) return;
    if (!frm.doc.company || !frm.doc.quotation_to || !frm.doc.party_name || !frm.doc.transaction_date) {
        return;
    }
    frappe.call({
        method: "erpnext.accounts.party.set_taxes",
        args: {
            party: frm.doc.party_name,
            party_type: frm.doc.quotation_to,
            posting_date: frm.doc.transaction_date,
            company: frm.doc.company,
            tax_category: frm.doc.tax_category,
            billing_address: frm.doc.customer_address,
        },
        callback(r) {
            frm.set_value("taxes_and_charges", r.message || null);
        },
    });
}

// Copy the chosen template's rows into the taxes table (ERPNext get_taxes_and_charges),
// then recalculate — the template only carries rate/charge_type, not this quotation's
// tax_amount/total/grand_total (those are computed by _apply_taxes over Butler's own net
// base), so every load must be followed by a recalc. Fires whenever taxes_and_charges
// changes: a manual pick, or Tax Rule resolving one via set_taxes_from_tax_category.
function populate_taxes_from_template(frm) {
    if (!frm.doc.taxes_and_charges) return;
    frm.call({
        method: "erpnext.controllers.accounts_controller.get_taxes_and_charges",
        args: {
            master_doctype: frm.fields_dict.taxes_and_charges.df.options,
            master_name: frm.doc.taxes_and_charges,
        },
        callback(r) {
            if (r.exc) return;
            frm.set_value("taxes", r.message || []);
            recalculate_quotation(frm);
        },
    });
}

// Build a link query filtered by the currently selected party (Dynamic Link),
// nudging the user to pick a party first — the same UX as ERPNext's queries.js.
function party_link_query(frm, query) {
    if (!frm.doc.party_name) {
        frm.scroll_to_field("party_name");
        frappe.show_alert({
            message: __("Please set {0} first.", [__("Party")]),
            indicator: "orange",
        });
    }
    return {
        query,
        filters: {
            link_doctype: frm.doc.quotation_to,
            link_name: frm.doc.party_name,
        },
    };
}
