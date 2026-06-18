import frappe


def link_facility_on_customer_create(doc, method=None):
    """
    When a Customer is created from a Lead, find all Facility documents
    whose links child table references that Lead and append the new Customer
    link to them (mirroring ERPNext's link_address_and_contact behaviour).
    """
    if not doc.lead_name:
        return

    # Find all Facility records linked to this Lead via Dynamic Link
    facility_links = frappe.get_all(
        "Dynamic Link",
        filters={
            "parenttype": "Facility",
            "link_doctype": "Lead",
            "link_name": doc.lead_name,
        },
        fields=["parent"],
    )

    for row in facility_links:
        facility = frappe.get_doc("Facility", row.parent)

        # Skip if the Customer link already exists
        already_linked = any(
            d.link_doctype == "Customer" and d.link_name == doc.name
            for d in facility.get("links")
        )
        if already_linked:
            continue

        facility.append("links", {"link_doctype": "Customer", "link_name": doc.name})
        facility.save(ignore_permissions=True)
