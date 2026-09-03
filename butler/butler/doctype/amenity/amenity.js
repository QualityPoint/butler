// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt

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

frappe.ui.form.on("Amenity", {
    setup(frm) {
        butler.filters.filter_amenity(frm, "amenity");
        butler.filters.filter_annex(frm, "annex", "annexes");

        frm.set_query("uom", "annexes", (doc, cdt, cdn) => {
            const row = locals[cdt][cdn];
            return {
                query: "butler.utils.queries.get_item_uom_query",
                filters: {
                    item_code: row.annex,
                },
            };
        });
    },

    refresh(frm) {
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

        frappe.db.get_value("Item", row.annex, ["sales_uom", "stock_uom"]).then(({ message }) => {
            frappe.model.set_value(cdt, cdn, "uom", message.sales_uom || message.stock_uom);
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
