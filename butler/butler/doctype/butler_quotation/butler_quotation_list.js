// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt

frappe.listview_settings["Butler Quotation"] = {
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
