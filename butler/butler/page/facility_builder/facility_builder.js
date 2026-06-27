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
	pin_sidebar();
	load_facility_builder(wrapper);
};

// Keep the desk Workspace Sidebar in sync. Frappe resolves the active sidebar
// reliably for DocType routes but not for this Page: the `<mode>/<name>` sub-route
// makes its route→sidebar matcher read the mode ("quotation"/"facility") as the
// entity, and the page's module ("Butler") doesn't equal the sidebar title
// ("Smart Homes") so the module fallback misses too. So pin it explicitly here
// (covers reload / deep-link, where the launch buttons' route_options didn't run).
function pin_sidebar() {
	const sb = frappe.app?.sidebar;
	if (!sb) return;
	if (sb.sidebar_title !== "Smart Homes") sb.setup("Smart Homes");
	sb.set_active_workspace_item();
}

frappe.pages["facility-builder"].on_page_hide = function () {
	frappe.facility_builder?.destroy?.();
	frappe.facility_builder = null;
};

function load_facility_builder(wrapper) {
	// route: ["facility-builder", "<mode>", "<name>"]  (mode = "facility" | "quotation")
	// back-compat: ["facility-builder", "<quotation-name>"] → quotation mode
	let route = frappe.get_route();
	let $parent = $(wrapper).find(".layout-main-section");

	// tear down any previous builder session (sub-route changes don't fire on_page_hide)
	frappe.facility_builder?.destroy?.();
	frappe.facility_builder = null;
	$parent.empty();

	let mode = null;
	let name = null;
	if (route.length > 2) {
		mode = route[1] === "facility" ? "facility" : "quotation";
		name = route[2];
	} else if (route.length === 2) {
		mode = "quotation";
		name = route[1];
	}

	if (name) {
		frappe.require("facility_builder.bundle.js").then(() => {
			frappe.facility_builder = new frappe.ui.FacilityBuilder({
				wrapper: $parent,
				page: wrapper.page,
				mode,
				name,
			});
		});
	} else {
		show_start($parent, wrapper.page);
	}
}

// Inline start screen (no popup) — pick a Facility (start a new layout) OR an existing
// Butler Quotation (edit it). New facilities/quotations are created from their own doctypes.
function show_start($parent, page) {
	// reset any chrome a previous builder session left on the page
	page.clear_primary_action();
	page.clear_actions();
	page.clear_menu();
	page.clear_indicator();
	page.set_title(__("Facility Builder"));

	$parent.html(`
		<div style="padding: var(--padding-md); max-width: 300px;">
			<div class="dt-field"></div>
			<div class="dn-field" style="margin-top: var(--margin-sm);"></div>
			<p style="margin-top: var(--margin-sm);">
				<button class="btn btn-sm btn-default btn-open-target">${__("Open")}</button>
			</p>
		</div>
	`);

	const ALLOWED = ["Facility", "Butler Quotation"];

	// Document Type → restricted to the two doctypes the builder understands
	let dt_control = frappe.ui.form.make_control({
		parent: $parent.find(".dt-field"),
		df: {
			fieldtype: "Link",
			fieldname: "document_type",
			options: "DocType",
			label: __("Document Type"),
			reqd: 1,
			get_query: () => ({ filters: { name: ["in", ALLOWED] } }),
			onchange: () => {
				let dt = dt_control.get_value();
				// the Dynamic Link's label adapts to the chosen doctype (Frappe pattern)
				dn_control.set_label(dt ? __(dt) : __("Document"));
				dn_control.set_value("");
				dn_control.refresh();
			},
		},
		render_input: true,
	});

	// Document Name → Dynamic Link whose target doctype is whatever document_type holds
	let dn_control = frappe.ui.form.make_control({
		parent: $parent.find(".dn-field"),
		df: {
			fieldtype: "Dynamic Link",
			fieldname: "document_name",
			options: "document_type",
			label: __("Document"),
			get_options: () => dt_control.get_value(),
			only_select: true,
		},
		render_input: true,
	});

	// default to Butler Quotation (the common case: editing an existing quotation)
	dt_control.set_value("Butler Quotation");
	dn_control.set_label(__("Butler Quotation"));
	dn_control.refresh();

	$parent.find(".btn-open-target").on("click", () => {
		let dt = dt_control.get_value();
		let name = dn_control.get_value();
		if (!dt || !name) {
			frappe.msgprint(__("Select a Document Type and a Document."));
			return;
		}
		let mode = dt === "Facility" ? "facility" : "quotation";
		frappe.set_route("facility-builder", mode, name);
	});
}
