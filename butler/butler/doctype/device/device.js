// Copyright (c) 2026, QualityPoint and contributors
// For license information, please see license.txt

frappe.ui.form.on("Device", {
    setup(frm) {
        butler.filters.filter_device(frm, "device_item");
    },
});
