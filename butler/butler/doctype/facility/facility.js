// Copyright (c) 2025, QualityPoint and contributors
// For license information, please see license.txt

frappe.ui.form.on("Facility", {
    setup(frm) {
        frm.set_query("link_doctype", "links", function () {
            return {
                filters: {
                    name: ["in", ["Customer", "Lead"]]
                }
            };
        });
    },
    refresh(frm) {
        if (!frm.doc.__islocal) {
            frappe.contacts.render_address_and_contact(frm);
            frm.add_custom_button(__("Open Facility Builder"), () => {
                // pin the desk sidebar — the builder's <mode>/<name> sub-route can't be
                // resolved to a Workspace Sidebar by Frappe's route→sidebar matcher
                frappe.route_options = { sidebar: "Smart Homes" };
                frappe.set_route("facility-builder", "facility", frm.doc.name);
            });
        } else {
            frappe.contacts.clear_address_and_contact(frm);
        }
    },

    // Resolve whatever was pasted from Google Maps (link, plus code, address or
    // "lat, lng") into a pin. Only `location` is written: the `location` handler
    // below already syncs latitude/longitude and enforces the single-pin rule, so
    // writing the floats too would push the same value back the other way.
    assign_location(frm) {
        if (!frm.doc.google_maps_location) {
            frappe.show_alert({
                message: __("Enter a Google Maps location first."),
                indicator: "orange",
            });
            return;
        }

        frappe.call({
            method: "butler.utils.location.map_location.resolve_map_location",
            args: { value: frm.doc.google_maps_location },
            freeze: true,
            freeze_message: __("Resolving location…"),
            callback(r) {
                if (!r.message) return;
                const { latitude, longitude, matched_address } = r.message;

                frm.set_value(
                    "location",
                    butler.geolocation.build_geolocation_json(latitude, longitude)
                );
                frm.refresh_field("location");

                frappe.show_alert({
                    message: __("Location set: {0}", [
                        matched_address || `${latitude}, ${longitude}`,
                    ]),
                    indicator: "green",
                });
            },
        });
    },

    // Sync geolocation to float fields when location changes (including "Clear All")
    location(frm) {
        butler.geolocation.sync_geolocation_to_floats(frm, 'location', 'latitude', 'longitude');
    },
});

frappe.ui.form.on("Dynamic Link", {
    link_name(frm, cdt, cdn) {
        const child = locals[cdt][cdn];
        if (child.link_name) {
            frappe.model.with_doctype(child.link_doctype, function () {
                const title_field = frappe.get_meta(child.link_doctype).title_field || "name";
                frappe.model.get_value(
                    child.link_doctype,
                    child.link_name,
                    title_field,
                    function (r) {
                        frappe.model.set_value(cdt, cdn, "link_title", r[title_field]);
                    }
                );
            });
        }
    },
});