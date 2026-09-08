frappe.pages["facility-builder"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Facility Builder"),
		single_column: true,
	});

	// Re-pin the sidebar after every route change, not just on page show.
	//
	// Frappe re-resolves the sidebar on each route change (Sidebar.setup_events ->
	// set_workspace_sidebar), and its handler is registered at boot — so it runs BEFORE
	// on_page_show and its answer is the one left standing. Registering here, once, puts
	// ours after it. Guarded to this page so it costs nothing anywhere else.
	frappe.router.on("change", () => {
		if (frappe.get_route()[0] === "facility-builder") pin_sidebar();
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

// Keep the desk Workspace Sidebar on "Smart Homes" for this page.
//
// Frappe resolves the sidebar from the route, which it gets wrong here:
// `entity_from_route` reads the SUB-ROUTE MODE of facility-builder/<mode>/<name> as the
// entity, so it looks for a sidebar linking to "quotation" or "facility", finds none,
// and falls back to the page's module — and `workspace_sidebar_item["butler"]` does
// exist (it is keyed by module, not by workspace title). So it swaps the 13-item
// "Smart Homes" sidebar for the 10-item "Butler" module one, which is what looked like
// the icons going messy.
//
// Only re-setup when the title is actually wrong: each setup() leaves its old
// SidebarItem objects in Sidebar.items — empty() clears the markup, not the array — so
// they accumulate (8 -> 16 -> 24) and get_item() can match a detached one by label.
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
