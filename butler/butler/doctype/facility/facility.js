// Copyright (c) 2025, QP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Facility", {
    setup(frm) {
        frm.set_query("facility_for", function () {
            return {
                filters: {
                    name: ["in", ["Customer", "Lead"]]
                }
            };
        });
    },
    multistorey(frm) {
        if (frm.doc.multistorey) {
            frm.set_value("total_area", null);
        } else {
            frm.set_value({
                "number_of_floors": null,
                "floor_area": null,
            });
        }
    },

    number_of_floors(frm) {
        calculate_total_area(frm);
    },

    floor_area(frm) {
        calculate_total_area(frm);
    }
});

function calculate_total_area(frm) {
    if (frm.doc.multistorey && frm.doc.number_of_floors && frm.doc.floor_area) {
        frm.set_value("total_area", frm.doc.number_of_floors * frm.doc.floor_area);
    }
}
