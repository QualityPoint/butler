// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt

frappe.ui.form.on("Amenity", {
    setup(frm) {
        // Restrict Amenity Item to non-stock Items not already used by an active
        // Butler Bundle, the reciprocal of Butler Bundle's bundle_item query, so
        // Bundle and Amenity items stay mutually exclusive.
        frm.set_query("amenity_item", () => ({
            query: "butler.utils.queries.get_amenity_item",
        }));

        frm.set_query("annex_name", "annexes", () => {
            return {
                filters: {
                    disabled: 0
                },
            };
        });
    },

    amenity_item(frm) {
        if (frm.doc.amenity_item) {
            butler.queries.get_item_name(frm, frm.doc.amenity_item, "amenity_name");
        } else {
            frm.set_value("amenity_name", null);
        }
    }
});
