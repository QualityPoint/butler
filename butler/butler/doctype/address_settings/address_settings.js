// Copyright (c) 2026, QP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Address Settings", {
    fetch_coordinates_from_country(frm) {
        frappe.call({
            method: "butler.butler.doctype.address_settings.address_settings.fetch_country_coordinates",
            freeze: true,
            freeze_message: __("Fetching coordinates…"),
            callback: function (r) {
                if (!r.message) return;
                frm.set_value({
                    "default_map_latitude": r.message.latitude,
                    "default_map_longitude": r.message.longitude
                });
                frm.save().then(() => {
                    frappe.show_alert({
                        message: __(
                            "Coordinates set and saved for {0}.",
                            [r.message.country]
                        ),
                        indicator: "green",
                    });
                });
            },
        });
    },
});
