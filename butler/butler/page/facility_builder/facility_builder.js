frappe.pages["facility-builder"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Facility Builder"),
		single_column: true,
	});

	// hot reload in development
	if (frappe.boot.developer_mode) {
		frappe.hot_update = frappe.hot_update || [];
		frappe.hot_update.push(() => load_facility_builder(wrapper));
	}
};

frappe.pages["facility-builder"].on_page_show = function (wrapper) {
	// Re-register the breadcrumb for the CURRENT route on every show. The page's
	// own breadcrumb is keyed by the full route string and only set once at page
	// creation, so a dynamic sub-route (facility-builder/<name>) would otherwise
	// have no breadcrumb. Mirrors print.js's set_breadcrumbs() pattern.
	frappe.breadcrumbs.add({
		type: "Custom",
		label: __("Facility Builder"),
		route: "facility-builder",
	});
	load_facility_builder(wrapper);
};

frappe.pages["facility-builder"].on_page_hide = function () {
	frappe.facility_builder?.destroy?.();
	frappe.facility_builder = null;
};

function load_facility_builder(wrapper) {
	let route = frappe.get_route(); // ["facility-builder", "<facility-name>"]
	let $parent = $(wrapper).find(".layout-main-section");
	$parent.empty();

	if (route.length > 1) {
		frappe.require("facility_builder.bundle.js").then(() => {
			frappe.facility_builder = new frappe.ui.FacilityBuilder({
				wrapper: $parent,
				page: wrapper.page,
				facility: route[1],
			});
		});
	} else {
		show_start($parent, wrapper.page);
	}
}

// Inline start screen (no popup) — pick an existing Facility to edit.
// New facilities are created through the Facility doctype, not from here.
function show_start($parent, page) {
	// reset any chrome a previous builder session left on the page
	page.clear_primary_action();
	page.clear_actions();
	page.clear_menu();
	page.clear_indicator();
	page.set_title(__("Facility Builder"));

	$parent.html(`
		<div style="padding: var(--padding-md); max-width: 300px;">
			<div class="facility-selector"></div>
			<p style="margin-top: var(--margin-sm);">
				<button class="btn btn-sm btn-default btn-edit-facility">${__("Edit")}</button>
			</p>
		</div>
	`);

	let facility_input = frappe.ui.form.make_control({
		parent: $parent.find(".facility-selector"),
		df: {
			fieldtype: "Link",
			options: "Facility",
			label: __("Facility"),
			description: __("Select Facility to Edit"),
			only_select: true,
		},
		render_input: true,
	});

	$parent.find(".btn-edit-facility").on("click", () => {
		let name = facility_input.get_value();
		if (!name) return;
		frappe.set_route("facility-builder", name);
	});
}
