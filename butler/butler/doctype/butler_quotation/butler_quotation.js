// Copyright (c) 2026, QP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Butler Quotation", {
    onload(frm) {
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
        if (frm.is_new()) return; // need a saved quotation to attach geometry to
        frm.add_custom_button(__("Open Facility Builder"), () => {
            frappe.set_route("facility-builder", "quotation", frm.doc.name);
        });

        // Create -> Sales Order, like ERPNext's Quotation (Amenities orders only,
        // while the quotation is submitted and not fully ordered/lost/cancelled).
        if (
            frm.doc.docstatus === 1 &&
            frm.doc.order_type === "Amenities" &&
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
    },
});
