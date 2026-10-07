// The Butler Portal is the Vue app at /butler, outside the desk. The dock can only open desk routes
// (it goes through frappe.set_route), so its Butler Portal button opens this page, which hands the
// browser over. `replace` swaps this page out of the history, so Back returns to where the user
// was rather than bouncing into the portal again.
frappe.pages["butler-portal"].on_page_show = function () {
	window.location.replace("/butler");
};
