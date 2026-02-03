// Copyright (c) 2026, QP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Butler Bundle", {
    setup(frm) {
        butler.filters.non_stock_item_filter(frm, "bundle_item");
    },

    bundle_item(frm) {
        if (frm.doc.bundle_item) {
            butler.queries.get_item_name(frm, frm.doc.bundle_item, "bundle_name");
        } else {
            frm.set_value("bundle_name", null);
        }
    }
});
