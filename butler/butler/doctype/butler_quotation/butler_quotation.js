// Copyright (c) 2026, QP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Butler Quotation", {
    refresh(frm) {
        if (frm.is_new()) return; // need a saved quotation to attach geometry to
        frm.add_custom_button(__("Open Facility Builder"), () => {
            frappe.set_route("facility-builder", "quotation", frm.doc.name);
        });
    },
});
