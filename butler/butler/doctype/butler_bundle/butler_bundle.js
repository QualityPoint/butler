// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt

frappe.ui.form.on("Butler Bundle", {
    setup(frm) {
        // Restrict the Bundle Item (the parent / representative Item) to valid
        // candidates, mirroring ERPNext's Product Bundle parent-item query:
        // non-stock, non-fixed-asset Items not already used by another bundle.
        frm.set_query("bundle_item", () => ({
            query: "butler.utils.queries.get_bundle_item",
        }));
    },

    refresh(frm) {
        // The Bundle Item can only be chosen on a new Bundle, then it's locked —
        // it backs bundle_name / the document identity, like Product Bundle's
        // parent item which is locked after save.
        frm.toggle_enable("bundle_item", frm.is_new());
    },

    bundle_item(frm) {
        if (frm.doc.bundle_item) {
            butler.queries.get_item_name(frm, frm.doc.bundle_item, "bundle_name");
        } else {
            frm.set_value("bundle_name", null);
        }
    }
});
