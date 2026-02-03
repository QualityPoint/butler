// Copyright (c) 2026, QP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Amenity", {
    setup(frm) {
        butler.filters.non_stock_item_filter(frm, "amenity_item");
    },

    amenity_item(frm) {
        if (frm.doc.amenity_item) {
            butler.queries.get_item_name(frm, frm.doc.amenity_item, "amenity_name");
        } else {
            frm.set_value("amenity_name", null);
        }
    }
});
