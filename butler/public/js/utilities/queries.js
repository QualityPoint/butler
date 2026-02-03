frappe.provide('butler.queries');

butler.queries = {
    get_item_name: function (frm, item, field) {
        return frappe.call({
            method: "butler.utils.queries.get_item_name",
            args: {
                item: item
            },
            callback: function (r) {
                if (r.message) {
                    frm.set_value(field, r.message);
                }
            }
        });
    }
}