// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt

frappe.ui.form.on("Annex Price", {
    setup(frm) {
        butler.filters.filter_annex(frm, "annex");
        butler.filters.filter_amenity(frm, "amenity");
    },

    refresh(frm) {
        // System-managed (kept in sync from Amenity.before_save) — lock the whole
        // form client-side, since permissions alone can't stop Administrator.
        frm.disable_form();
    },
});
