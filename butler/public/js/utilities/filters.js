frappe.provide('butler.filters');

butler.filters = {
    filter_amenity: function (frm, field, parentfield) {
        butler.filters._set_query(frm, field, parentfield, {
            disabled: 0,
            is_amenity: 1
        });
    },

    filter_annex: function (frm, field, parentfield) {
        butler.filters._set_query(frm, field, parentfield, {
            disabled: 0,
            is_annex: 1
        });
    },

    _set_query: function (frm, field, parentfield, filters) {
        const query = () => ({ filters });
        if (parentfield) {
            frm.set_query(field, parentfield, query);
        } else {
            frm.set_query(field, query);
        }
    }
}