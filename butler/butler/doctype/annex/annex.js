// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt

frappe.ui.form.on("Annex", {
    setup(frm) {
        butler.filters.filter_annex(frm, "annex_item");
    },
});
