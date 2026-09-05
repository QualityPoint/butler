frappe.provide('butler.utils');

butler.utils = {
    // Render real currency codes into Currency-field labels ("Total (SAR)"), mirroring
    // ERPNext's transaction.js set_currency_labels_from_options. `options_map` maps a
    // Currency field's `options` to the code it should show; `parentfields` lists the
    // child grids to cover, where null means the parent form itself.
    //
    // Grid labels go through grid.update_docfield_property, which doesn't repaint on its
    // own — call frm.refresh_fields() after this, the way ERPNext's refresh_currency does.
    set_currency_labels: function (frm, options_map, parentfields = [null]) {
        for (const parentfield of parentfields) {
            const grid = parentfield && frm.fields_dict[parentfield] && frm.fields_dict[parentfield].grid;
            const doctype = parentfield ? grid && grid.doctype : frm.doctype;
            if (!doctype) continue;

            for (const [options, code] of Object.entries(options_map)) {
                if (!code) continue;
                const fields = frappe.meta
                    .get_docfields(doctype)
                    .filter((df) => df.fieldtype === "Currency" && df.options === options)
                    .map((df) => df.fieldname);
                frm.set_currency_labels(fields, code, parentfield);
            }
        }
    },
}
