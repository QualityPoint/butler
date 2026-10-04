// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt

frappe.listview_settings["Butler Quotation"] = {
    onload(listview) {
        // Bulk "Reset Amenity" for the selected quotations — e.g. after the Amenities were
        // updated (Butler Managers, images, prices). One quotation per request, in turn, so a
        // long list never runs into a request timeout; drafts only, the rest are skipped.
        listview.page.add_actions_menu_item(__("Reset Amenity"), () => reset_amenity_bulk(listview));
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


function reset_amenity_bulk(listview) {
    const selected = listview.get_checked_items();
    if (!selected.some((d) => cint(d.docstatus) === 0)) {
        frappe.msgprint(__("Select at least one draft quotation."));
        return;
    }
    const dialog = new frappe.ui.Dialog({
        title: __("Reset Amenity"),
        fields: [
            {
                fieldname: "scope", fieldtype: "Select", label: __("Reset"), reqd: 1, default: "all",
                options: [
                    { value: "all", label: __("All amenities") },
                    { value: "types", label: __("By amenity type") },
                ],
            },
            {
                fieldname: "amenity_types", fieldtype: "MultiSelectList", label: __("Amenity types"),
                depends_on: "eval:doc.scope=='types'",
                get_data: (txt) =>
                    frappe.db
                        .get_list("Amenity", {
                            fields: ["name"],
                            filters: txt ? { name: ["like", `%${txt}%`] } : {},
                            limit: 50,
                            order_by: "name asc",
                        })
                        .then((rows) => rows.map((r) => ({ value: r.name, label: frappe.utils.escape_html(__(r.name)), description: "" }))),
            },
            { fieldtype: "Section Break", label: __("What to reset") },
            ...butler.reset_amenity_options(),
        ],
        primary_action_label: __("Reset"),
        primary_action(values) {
            const options = butler.picked_reset_options(values);
            if (!options.length) {
                frappe.msgprint(__("Choose what to reset."));
                return;
            }
            if (values.scope === "types" && !(values.amenity_types || []).length) {
                frappe.msgprint(__("Select the amenity types or amenities to reset."));
                return;
            }
            dialog.hide();
            run_reset_amenity(listview, selected, options, values.scope === "types" ? values.amenity_types : null);
        },
    });
    dialog.show();
}

async function run_reset_amenity(listview, selected, options, amenities) {
    const drafts = selected.filter((d) => cint(d.docstatus) === 0).map((d) => d.name);
    const skipped = selected.filter((d) => cint(d.docstatus) !== 0).map((d) => d.name);
    const title = __("Resetting amenities");
    const failed = [];
    let rooms = 0;
    for (const [i, name] of drafts.entries()) {
        frappe.show_progress(title, i, drafts.length, name);
        try {
            const args = { name, options };
            if (amenities) args.amenities = amenities;
            const result = await frappe.xcall(
                "butler.butler.doctype.butler_quotation.butler_quotation.reset_amenities", args);
            rooms += cint(result?.rooms);
        } catch (e) {
            failed.push(name);
        }
    }
    frappe.show_progress(title, drafts.length, drafts.length);
    frappe.hide_progress();

    const lines = [__("{0} quotations reset, {1} amenities.", [drafts.length - failed.length, rooms])];
    if (skipped.length) lines.push(__("Skipped (not a draft): {0}", [skipped.join(", ")]));
    if (failed.length) lines.push(__("Failed: {0}", [failed.join(", ")]));
    frappe.msgprint({ title: __("Reset Amenity"), message: lines.join("<br>"), indicator: failed.length ? "orange" : "green" });
    listview.refresh();
}
