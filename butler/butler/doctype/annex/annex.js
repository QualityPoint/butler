// Copyright (c) 2025, QualityPoint and contributors
// For license information, please see license.txt

frappe.ui.form.on("Annex", {
    setup(frm) {
        // Restrict Annex Item to non-stock Items not already used by an active
        // Butler Bundle or Amenity, so Bundle / Amenity / Annex items stay
        // mutually exclusive.
        frm.set_query("annex_item", () => ({
            query: "butler.utils.queries.get_annex_item",
        }));
    },

    annex_item(frm) {
        if (frm.doc.annex_item) {
            butler.queries.get_item_name(frm, frm.doc.annex_item, "annex_name");
        } else {
            frm.set_value("annex_name", null);
        }
    }
});
