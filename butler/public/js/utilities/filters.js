frappe.provide('butler.filters');

butler.filters = {
    non_stock_item_filter: function (frm, field) {
        frm.set_query(field, function () {
            return {
                filters: {
                    disabled: 0,
                    is_stock_item: 0
                }
            };
        });
    }
}