// Copyright (c) 2026, QP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Butler Quotation", {
    onload(frm) {
        // Default the company like ERPNext: user/session default, then the
        // Global Defaults default company. (The server resolves it too, but
        // setting it here keeps the reqd field from blocking the form.)
        if (frm.is_new() && !frm.doc.company) {
            const company =
                frappe.defaults.get_user_default("Company") ||
                frappe.defaults.get_global_default("company");
            if (company) frm.set_value("company", company);
        }
    },
    refresh(frm) {
        if (frm.is_new()) return; // need a saved quotation to attach geometry to
        frm.add_custom_button(__("Open Facility Builder"), () => {
            frappe.set_route("facility-builder", "quotation", frm.doc.name);
        });
    },
});
