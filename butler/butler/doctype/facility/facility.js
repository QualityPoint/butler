// Copyright (c) 2025, QP and contributors
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