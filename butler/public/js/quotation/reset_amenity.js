// "Reset Amenity" options, shared by the Butler Quotation form and its list view's bulk
// action. In the app bundle because a doctype's form script only loads with the form, and
// the list needs them too. The server side is reset_amenities (butler_quotation.py).
frappe.provide("butler");

butler.reset_amenity_options = () => [
    {
        fieldname: "details", fieldtype: "Check", label: __("Details"), default: 1,
        description: __("Butler Manager, image, category and annex details from the Amenity and Annex records. No price changes."),
    },
    {
        fieldname: "prices", fieldtype: "Check", label: __("Prices"),
        description: __("Every Quotation Price (annex, light system, sound system, floor) back to its standard."),
    },
    {
        fieldname: "annexes", fieldtype: "Check", label: __("Annexes"),
        description: __("Each amenity's annexes back to the Amenity's own list, undoing Facility Builder edits."),
    },
    {
        fieldname: "light_sound", fieldtype: "Check", label: __("Light & sound"),
        description: __("Default light system, sound off, no device picked."),
    },
    {
        fieldtype: "HTML", fieldname: "reset_note",
        options: `<div class="text-muted small">${__("Prices, Annexes and Light & sound recalculate the totals and keep a record in the timeline. Light system devices are always recounted.")}</div>`,
    },
];

butler.picked_reset_options = (values) =>
    ["details", "prices", "annexes", "light_sound"].filter((key) => cint(values[key]));
