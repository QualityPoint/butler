// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt


frappe.ui.form.on("Amenity", {
    setup(frm) {
        butler.filters.filter_amenity(frm, "amenity");

        // Scoped to the row's Annex — the query resolves its `annex_item`, which is
        // what actually owns the UOMs.
        frm.set_query("uom", "annexes", (doc, cdt, cdn) => {
            const row = locals[cdt][cdn];
            return {
                query: "butler.utils.queries.get_annex_uom_query",
                filters: {
                    annex: row.annex,
                },
            };
        });

        // Each Light System belongs to the amenity once (validate_light_systems enforces
        // it server-side) — hide the ones already taken so the duplicate can't be picked.
        // The row's own value is kept in the list, or it couldn't be reselected.
        frm.set_query("system_name", "light_systems", (doc, cdt, cdn) => {
            const taken = (doc.light_systems || [])
                .filter((row) => row.system_name && row.name !== cdn)
                .map((row) => row.system_name);
            return {
                filters: {
                    name: ["not in", taken]
                }
            };
        });

        // Each Facility Type belongs to the amenity once (validate_facility_types enforces
        // it server-side) — hide the ones already added.
        frm.set_query("facility_types", (doc) => ({
            filters: {
                name: ["not in", (doc.facility_types || []).map((row) => row.facility_type)],
            },
        }));
    },

    refresh(frm) {
        set_currency_labels(frm);

        if (frm.is_new()) {
            return;
        }

        frm.add_custom_button(
            __("Annex Prices"),
            () => {
                frappe.set_route("List", "Annex Price", { amenity: frm.doc.name });
            },
            __("View")
        );
    },

    currency(frm) {
        set_currency_labels(frm);
    },

    annexes_add(frm) {
        calculate_totals(frm);
    },

    annexes_remove(frm) {
        calculate_totals(frm);
    },
});

frappe.ui.form.on("Amenity Annex Item", {
    annex(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (!row.annex) {
            return;
        }

        // Same resolver the server-side default uses, so both agree on the UOM.
        frappe.call({
            method: "butler.butler.doctype.annex.annex.get_annex_default_uom",
            args: { annex: row.annex },
            callback: ({ message }) => {
                frappe.model.set_value(cdt, cdn, "uom", message);
            },
        });
    },

    qty(frm, cdt, cdn) {
        calculate_amount(frm, cdt, cdn);
    },

    rate(frm, cdt, cdn) {
        calculate_amount(frm, cdt, cdn);
    },

    pricing_per_facility_type(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (frm.is_new()) {
            frappe.throw(__("Save the Amenity before setting a Facility Type price."));
        }
        if (!row.annex || !row.uom) {
            frappe.throw(__("Set the Annex and UOM for this row first."));
        }

        const dialog = new frappe.ui.Dialog({
            title: __("Facility Type Pricing"),
            fields: [
                {
                    fieldname: "facility_type",
                    fieldtype: "Link",
                    label: __("Facility Type"),
                    options: "Facility Type",
                    reqd: 1,
                },
                {
                    fieldname: "rate",
                    fieldtype: "Currency",
                    label: __("Rate"),
                    options: frm.doc.currency,
                    reqd: 1,
                },
            ],
            primary_action_label: __("Confirm"),
            primary_action(values) {
                frappe.call({
                    method: "butler.butler.doctype.annex_price.annex_price.create_facility_type_annex_price",
                    args: {
                        amenity: frm.doc.name,
                        annex: row.annex,
                        uom: row.uom,
                        currency: frm.doc.currency,
                        facility_type: values.facility_type,
                        rate: values.rate,
                    },
                    freeze: true,
                    callback: () => {
                        dialog.hide();
                        frappe.show_alert({ message: __("Facility Type price saved"), indicator: "green" });
                    },
                });
            },
        });

        dialog.show();
    },
});


// Amenity is single-currency — no company-currency mirrors — so every Currency field
// resolves to the document currency, across the header and the annexes / light_systems
// grids.
function set_currency_labels(frm) {
    butler.utils.set_currency_labels(frm, { currency: frm.doc.currency }, [
        null,
        "annexes",
        "light_systems",
    ]);
    frm.refresh_fields();
}

function calculate_totals(frm) {
    let total_qty = 0;
    let total = 0;

    (frm.doc.annexes || []).forEach((row) => {
        total_qty += flt(row.qty);
        total += flt(row.amount);
    });

    frm.set_value("total_qty", total_qty);
    frm.set_value("total", flt(total, precision("total")));
}

function calculate_amount(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    frappe.model.set_value(cdt, cdn, "amount", flt(flt(row.qty) * flt(row.rate), precision("amount", row)));
    calculate_totals(frm);
}