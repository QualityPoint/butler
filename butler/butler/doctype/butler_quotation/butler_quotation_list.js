// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt

frappe.listview_settings["Butler Quotation"] = {
    onload(listview) {
        // Bulk "Refresh from Amenities" for the selected quotations — after the Amenities
        // were updated (Butler Managers, images…). One quotation per request, in turn, so
        // a long list never runs into a request timeout; drafts only, the rest are skipped.
        listview.page.add_actions_menu_item(__("Refresh from Amenities"), () =>
            refresh_selected_from_amenities(listview)
        );
    },
    get_indicator(doc) {
        // Show "Expired" (like ERPNext's Quotation) when the validity has passed
        // and the quotation isn't in a terminal state. Returning nothing lets the
        // default status-based indicator apply.
        if (
            doc.valid_till &&
            frappe.datetime.get_diff(doc.valid_till, frappe.datetime.get_today()) < 0 &&
            !["Ordered", "Partially Ordered", "Lost", "Cancelled"].includes(doc.status)
        ) {
            return [__("Expired"), "gray", "valid_till,<,Today"];
        }
    },
};


async function refresh_selected_from_amenities(listview) {
    const selected = listview.get_checked_items();
    const drafts = selected.filter((d) => cint(d.docstatus) === 0).map((d) => d.name);
    const skipped = selected.filter((d) => cint(d.docstatus) !== 0).map((d) => d.name);
    if (!drafts.length) {
        frappe.msgprint(__("Select at least one draft quotation."));
        return;
    }

    const title = __("Refreshing from Amenities");
    const failed = [];
    let rows = 0;
    for (const [i, name] of drafts.entries()) {
        frappe.show_progress(title, i, drafts.length, name);
        try {
            const result = await frappe.xcall(
                "butler.butler.doctype.butler_quotation.butler_quotation.refresh_amenity_fields",
                { name }
            );
            rows += cint(result?.rows_updated);
        } catch (e) {
            failed.push(name);
        }
    }
    frappe.show_progress(title, drafts.length, drafts.length);
    frappe.hide_progress();

    const lines = [
        __("{0} quotations refreshed, {1} rows updated, devices recounted.", [drafts.length - failed.length, rows]),
    ];
    if (skipped.length) lines.push(__("Skipped (not a draft): {0}", [skipped.join(", ")]));
    if (failed.length) lines.push(__("Failed: {0}", [failed.join(", ")]));
    frappe.msgprint({ title: __("Refresh from Amenities"), message: lines.join("<br>"), indicator: failed.length ? "orange" : "green" });
    listview.refresh();
}
