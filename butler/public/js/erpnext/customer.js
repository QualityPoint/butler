// Copyright (c) 2025, QualityPoint and contributors
// For license information, please see license.txt

frappe.ui.form.on("Customer", {
    refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__("Facility"), function () {
                frappe.model.with_doctype("Facility", function () {
                    const facility = frappe.model.get_new_doc("Facility");
                    const link_row = frappe.model.add_child(facility, "links");
                    link_row.link_doctype = "Customer";
                    link_row.link_name = frm.doc.name;
                    link_row.link_title = frm.doc.customer_name;
                    frappe.set_route("Form", "Facility", facility.name);
                });
            }, __("Create"));
        }
    },
});
