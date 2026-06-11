// Copyright (c) 2026, QP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Butler Quotation", {
    setup(frm) {
        frm.set_query("amenity_name", "amenities", function () {
            return {
                filters: {
                    disabled: 0
                }
            };
        });
    },

    bundle_type(frm) {
        if (frm.doc.bundle_type && frm.doc.order_type === "Bundle") {
            // Call server-side method to get bundle details
            frappe.call({
                method: "butler.butler.doctype.butler_quotation.butler_quotation.get_bundle_details",
                args: {
                    bundle_type: frm.doc.bundle_type
                },
                callback: function (r) {
                    if (r.message) {
                        // Set bundle price
                        frm.set_value("bundle_price", r.message.bundle_price);
                        frm.set_df_property("discount", "description",
                            __("Maximum allowed discount for this bundle: {0}%", [r.message.max_discount])
                        );

                        // Clear existing amenity categories
                        frm.clear_table("amenity_categories");

                        // Populate amenity categories
                        if (r.message.amenity_categories && r.message.amenity_categories.length > 0) {
                            r.message.amenity_categories.forEach(function (category) {
                                let row = frm.add_child("amenity_categories");
                                row.amenity_category = category.amenity_category;
                                row.number_of_amenities = category.number_of_amenities;
                            });
                        }

                        // Refresh the child table
                        frm.refresh_field("amenity_categories");
                        frm.refresh_field("bundle_price");
                    }
                }
            });
        } else {
            // Clear bundle-related fields if bundle_type is cleared
            frm.set_value("bundle_price", 0);
            frm.clear_table("amenity_categories");
            frm.refresh_field("amenity_categories");
            frm.refresh_field("bundle_price");
        }
    },

    order_type(frm) {
        // Clear bundle fields when order type changes from Bundle
        if (frm.doc.order_type !== "Bundle") {
            frm.set_value({
                "bundle_type": "",
                "bundle_price": 0
            });
            frm.clear_table("amenity_categories");
            frm.refresh_field("amenity_categories");
            frm.refresh_field("bundle_price");
        }
    },

    facility(frm) {
        if (frm.doc.facility) {
            // Call server-side method to get facility specifications
            frappe.call({
                method: "butler.butler.doctype.butler_quotation.butler_quotation.get_facility_specifications",
                args: {
                    facility: frm.doc.facility
                },
                callback: function (r) {
                    if (r.message) {
                        let data = r.message;
                        // Populate facility specification fields
                        frm.set_value({
                            "facility_type": data.facility_type,
                            "multistorey": data.multistorey,
                            "number_of_floors": data.number_of_floors,
                            "floor_area": data.floor_area,
                            "total_area": data.total_area
                        });
                    }
                }
            });
        } else {
            // Clear facility specification fields if facility is cleared
            frm.set_value({
                "facility_type": "",
                "multistorey": 0,
                "number_of_floors": 0,
                "floor_area": 0,
                "total_area": 0
            });
        }
    }
});

// Child table event for amenities
frappe.ui.form.on("Facility Amenities", {
    amenity_name(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.amenity_name && frm.doc.facility) {
            // Call server-side method to get amenity details
            frappe.call({
                method: "butler.butler.doctype.butler_quotation.butler_quotation.get_amenity_details",
                args: {
                    amenity_name: row.amenity_name,
                    facility: frm.doc.facility
                },
                callback: function (r) {
                    if (r.message && Object.keys(r.message).length > 0) {
                        // Populate all fields from the returned data
                        Object.assign(row, {
                            amenity_category: r.message.amenity_category,
                            price: r.message.price,
                            image: r.message.image,
                            requires_number_of_floors: r.message.requires_number_of_floors,
                            is_dependant_amenity: r.message.is_dependant_amenity,
                            has_varied_price: r.message.has_varied_price,
                            amount: r.message.price * (row.count || 1)
                        });

                        frm.refresh_field("amenities");
                    } else {
                        // If empty response (disabled or not found), show warning
                        frappe.msgprint({
                            title: __('Amenity Not Available'),
                            indicator: 'red',
                            message: __('This amenity is disabled or not found.')
                        });
                        frappe.model.set_value(cdt, cdn, "amenity_name", "");
                    }
                }
            });
        }
    },

    count(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        // Recalculate amount when count changes
        if (row.price) {
            let amount = row.price * (row.count || 0);
            frappe.model.set_value(cdt, cdn, "amount", amount);
        }
        // Recalculate amenity count when count field changes
        calculate_amenity_count(frm);
        // Recalculate totals
        calculate_totals(frm);
    },

    amount(frm, cdt, cdn) {
        // Recalculate totals when amount changes
        calculate_totals(frm);
    },

    amenities_add(frm, cdt, cdn) {
        // Recalculate when new row is added
        calculate_amenity_count(frm);
        calculate_totals(frm);
    },

    amenities_remove(frm, cdt, cdn) {
        // Recalculate when row is removed
        calculate_amenity_count(frm);
        calculate_totals(frm);
    }
});

// Helper function to calculate amenity count
function calculate_amenity_count(frm) {
    let total_count = 0;

    if (frm.doc.amenities && frm.doc.amenities.length > 0) {
        frm.doc.amenities.forEach(function (amenity) {
            total_count += amenity.count || 0;
        });
    }

    frm.set_value("amenity_count", total_count);
}

// Helper function to calculate total and grand_total
function calculate_totals(frm) {
    let total = 0;

    // Sum all amounts from amenities child table
    if (frm.doc.amenities && frm.doc.amenities.length > 0) {
        frm.doc.amenities.forEach(function (amenity) {
            total += amenity.amount || 0;
        });
    }

    // Set total
    frm.set_value("total", total);

    // Set grand_total (same as total for now, can be modified if additional charges are added)
    frm.set_value("grand_total", total);
}
