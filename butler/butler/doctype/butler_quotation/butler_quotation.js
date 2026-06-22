// Copyright (c) 2026, QP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Butler Quotation", {
    setup(frm) {
        // Restrict Quotation To to the party types Butler supports (mirrors
        // ERPNext's Quotation, minus CRM Deal which Butler doesn't map).
        frm.set_query("quotation_to", () => ({
            filters: { name: ["in", ["Customer", "Lead"]] },
        }));

        // Lead party uses ERPNext's richer lead search; Customer/Prospect use
        // the default link query.
        frm.set_query("party_name", () => {
            if (frm.doc.quotation_to === "Lead") {
                return { query: "erpnext.controllers.queries.lead_query" };
            }
        });

        frm.set_query("bundle_type", () => {
            return {
                filters: {
                    disabled: 0
                },
            };
        });

        // Filter the billing Address and Contact to those linked to the selected
        // party, via its Dynamic Links (same endpoints ERPNext uses).
        frm.set_query("customer_address", () =>
            party_link_query(frm, "frappe.contacts.doctype.address.address.address_query")
        );
        frm.set_query("contact_person", () =>
            party_link_query(frm, "frappe.contacts.doctype.contact.contact.contact_query")
        );

        // Company address is filtered to the company's own addresses.
        frm.set_query("company_address", () => {
            if (!frm.doc.company) {
                frm.scroll_to_field("company");
                frappe.show_alert({
                    message: __("Please set {0} first.", [__("Company")]),
                    indicator: "orange",
                });
            }
            return {
                query: "frappe.contacts.doctype.address.address.address_query",
                filters: { link_doctype: "Company", link_name: frm.doc.company || "" },
            };
        });
    },

    onload(frm) {
        frm.trigger("set_dynamic_link");
        frm.trigger("set_dynamic_field_label");

        if (!frm.is_new()) return;

        // Default the company like ERPNext: user/session default, then the
        // Global Defaults default company. (The server resolves it too, but
        // setting it here keeps the reqd field from blocking the form.)
        if (!frm.doc.company) {
            const company =
                frappe.defaults.get_user_default("Company") ||
                frappe.defaults.get_global_default("company");
            if (company) frm.set_value("company", company);
        }

        // Default valid_till like ERPNext: transaction_date + Butler Settings
        // "Default Quotation Validity Days", falling back to +1 month.
        if (!frm.doc.valid_till && frm.doc.transaction_date) {
            frappe.db
                .get_single_value("Butler Settings", "default_valid_till")
                .then((days) => {
                    if (frm.doc.valid_till) return;
                    days = cint(days);
                    frm.set_value(
                        "valid_till",
                        days
                            ? frappe.datetime.add_days(frm.doc.transaction_date, days)
                            : frappe.datetime.add_months(frm.doc.transaction_date, 1)
                    );
                });
        }
    },

    refresh(frm) {
        frm.trigger("set_dynamic_link");
        frm.trigger("set_label");
        frm.trigger("set_dynamic_field_label");

        if (frm.is_new()) return; // need a saved quotation to attach geometry to
        frm.add_custom_button(__("Open Facility Builder"), () => {
            frappe.set_route("facility-builder", "quotation", frm.doc.name);
        });

        // Create -> Sales Order, like ERPNext's Quotation (Amenities orders only,
        // while the quotation is submitted and not fully ordered/lost/cancelled).
        if (
            frm.doc.docstatus === 1 &&
            frm.doc.order_type === "Amenities" &&
            !["Ordered", "Lost", "Cancelled"].includes(frm.doc.status)
        ) {
            frm.add_custom_button(
                __("Sales Order"),
                () => {
                    frappe.model.open_mapped_doc({
                        method: "butler.butler.doctype.butler_quotation.butler_quotation.make_sales_order",
                        frm: frm,
                    });
                },
                __("Create")
            );
            frm.page.set_inner_btn_group_as_primary(__("Create"));
        }
    },

    // frappe.dynamic_link points the address/contact link queries at the party.
    set_dynamic_link(frm) {
        frappe.dynamic_link = {
            doc: frm.doc,
            fieldname: "party_name",
            doctype: frm.doc.quotation_to,
        };
    },

    quotation_to(frm) {
        frm.trigger("set_dynamic_link");
        frm.trigger("set_label");
        frm.trigger("set_dynamic_field_label");
        // The party type changed, so any resolved name is no longer valid.
        // (party_name itself is kept, mirroring ERPNext.)
        frm.set_value("customer_name", "");
    },

    party_name(frm) {
        frm.trigger("set_dynamic_link");

        if (!frm.doc.party_name) {
            frm.set_value({
                customer_name: "",
                customer_address: "",
                customer_address_display: "",
                contact_person: "",
                contact_display: "",
                contact_mobile: "",
                contact_email: "",
            });
            return;
        }

        frappe.call({
            method: "butler.butler.doctype.butler_quotation.butler_quotation.get_party_details",
            args: {
                party_name: frm.doc.party_name,
                quotation_to: frm.doc.quotation_to,
            },
            callback(r) {
                if (!r.message) return;
                // Guard the address/contact triggers from firing mid-update,
                // exactly like ERPNext's updating_party_details flag.
                frm.updating_party_details = true;
                frappe.run_serially([
                    () => frm.set_value(r.message),
                    () => {
                        frm.updating_party_details = false;
                    },
                ]);
            },
        });
    },

    customer_address(frm) {
        erpnext.utils.get_address_display(
            frm,
            "customer_address",
            "customer_address_display"
        );
    },

    contact_person(frm) {
        erpnext.utils.get_contact_details(frm);
    },

    company(frm) {
        // Default the company's billing address, mirroring ERPNext's
        // set_default_company_address (keeps an existing valid one).
        if (!frm.doc.company) {
            frm.set_value("company_address", "");
            return;
        }
        frappe.call({
            method: "erpnext.setup.doctype.company.company.get_default_company_address",
            args: {
                name: frm.doc.company,
                existing_address: frm.doc.company_address || "",
            },
            debounce: 2000,
            callback(r) {
                frm.set_value("company_address", r.message || "");
            },
        });
    },

    company_address(frm) {
        erpnext.utils.get_address_display(
            frm,
            "company_address",
            "company_address_display"
        );
    },

    facility(frm) {
        // Render the Facility's default linked Address into facility_address,
        // mirroring customer_address_display / company_address_display.
        // (facility_type & project_name are handled by their fetch_from.)
        if (!frm.doc.facility) {
            frm.set_value("facility_address", "");
            return;
        }
        frappe.call({
            method: "butler.butler.doctype.butler_quotation.butler_quotation.get_facility_address_display",
            args: { facility: frm.doc.facility },
            callback(r) {
                frm.set_value("facility_address", r.message || "");
            },
        });
    },

    set_label(frm) {
        frm.fields_dict.customer_address.set_label(
            __((frm.doc.quotation_to || "Customer") + " Address")
        );
    },

    set_dynamic_field_label(frm) {
        const label =
            { Customer: "Customer", Lead: "Lead", Prospect: "Prospect" }[
            frm.doc.quotation_to
            ] || "Party";
        frm.set_df_property("party_name", "label", label);
    },
});

// Build a link query filtered by the currently selected party (Dynamic Link),
// nudging the user to pick a party first — the same UX as ERPNext's queries.js.
function party_link_query(frm, query) {
    if (!frm.doc.party_name) {
        frm.scroll_to_field("party_name");
        frappe.show_alert({
            message: __("Please set {0} first.", [__("Party")]),
            indicator: "orange",
        });
    }
    return {
        query,
        filters: {
            link_doctype: frm.doc.quotation_to,
            link_name: frm.doc.party_name,
        },
    };
}
