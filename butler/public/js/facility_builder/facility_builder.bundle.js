import { createApp, watch } from "vue";
import VueKonva, * as konva_components from "vue-konva";
import FacilityBuilderComponent from "./components/FacilityBuilder.vue";

// vue-konva declares `inheritAttrs: false` on Stage and nowhere else. Every other node
// component (Group, Layer, Rect, …) renders its slot, so its root is a fragment — and
// Vue's dev build then warns that our Konva listeners "could not be automatically
// inherited because component renders fragment or text root nodes".
//
// They are wired, though: vue-konva reads `on*` attrs in its own mount/update hooks and
// calls `node.on("dragstart.vue-konva-event", …)` on the Konva node. Vue just can't see
// that from the render, so the warning is a false alarm. Opting the components out of
// attribute fallthrough silences it without changing how a single event is bound —
// nothing could fall through to a fragment root anyway.
for (const component of Object.values(konva_components)) {
	if (component && typeof component === "object" && component.name) {
		component.inheritAttrs = false;
	}
}

class FacilityBuilder {
	constructor({ wrapper, page, mode, name }) {
		this.$wrapper = $(wrapper);
		this.page = page;
		this.mode = mode === "facility" ? "facility" : "quotation";
		this.name = name;
		const is_facility = this.mode === "facility";

		// --- own the Frappe page chrome (imperative side) ---
		this.page.clear_actions();
		this.page.clear_icons();
		this.page.clear_custom_actions();

		this.page.set_title(this.name);
		// facility mode "saves" by spawning a new quotation
		this.$save_btn = this.page.set_primary_action(
			is_facility ? __("Create Quotation") : __("Save"),
			() => this.$component.$store.save_changes()
		);
		// outside button (before the three-dots menu) → back to the source doc
		this.page.add_button(is_facility ? __("Open Facility") : __("Open Quotation"), () => {
			frappe.set_route("Form", is_facility ? "Facility" : "Butler Quotation", this.name);
		});
		this.$reset_btn = this.page.add_button(__("Reset Changes"), () =>
			this.$component.$store.reset_changes()
		);
		// under the three-dots menu
		this.page.add_menu_item(is_facility ? __("Change Facility") : __("Change Quotation"), () => {
			frappe.set_route("facility-builder");
		});

		// --- boot Vue (reactive side) ---
		this.app = createApp(FacilityBuilderComponent, { mode: this.mode, name: this.name });
		SetVueGlobals(this.app);
		this.app.use(VueKonva);
		this.$component = this.app.mount(this.$wrapper.get(0));

		// --- Vue → Frappe: reactive state drives the page chrome ---
		this.stop_chrome_watch = watch(
			() => [this.$component.$store.dirty.value, this.$component.$store.read_only.value],
			([dirty, read_only]) => {
				// submitted/cancelled quotations are view-only: hide Save + Reset
				if (read_only) {
					this.$save_btn?.hide();
					this.$reset_btn.hide();
					this.page.set_indicator(__("Read only"), "gray");
					return;
				}
				this.$save_btn?.show();
				if (dirty) {
					this.page.set_indicator(__("Not Saved"), "orange");
					this.$reset_btn.show();
				} else {
					this.page.clear_indicator();
					this.$reset_btn.hide();
				}
			},
			{ deep: true, immediate: true }
		);
	}

	destroy() {
		this.stop_chrome_watch?.(); // watch() outside a component is never stopped by unmount
		this.app?.unmount();
		this.app = null;
	}
}

frappe.provide("frappe.ui");
frappe.ui.FacilityBuilder = FacilityBuilder;
export default FacilityBuilder;
