// Copyright (c) 2025, QP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Amenity Annex", {
    setup(frm) {
        butler.filters.non_stock_item_filter(frm, "annex_item");
    },

    annex_item(frm) {
        if (frm.doc.annex_item) {
            butler.queries.get_item_name(frm, frm.doc.annex_item, "annex_name");
        } else {
            frm.set_value("annex_name", null);
        }
    }
});
