import { createApp, watch } from "vue";
import VueKonva from "vue-konva";
import FacilityBuilderComponent from "./components/FacilityBuilder.vue";

class FacilityBuilder {
	constructor({ wrapper, page, facility }) {
		this.$wrapper = $(wrapper);
		this.page = page;
		this.facility = facility;

		// --- own the Frappe page chrome (imperative side) ---
		this.page.clear_actions();
		this.page.clear_icons();
		this.page.clear_custom_actions();

		this.page.set_title(this.facility);
		this.page.set_primary_action(__("Save"), () => {
			this.$component.$store.save_changes();
		});
		// outside button (before the three-dots menu)
		this.page.add_button(__("Open Facility"), () => {
			frappe.set_route("Form", "Facility", this.facility);
		});
		this.$reset_btn = this.page.add_button(__("Reset Changes"), () =>
			this.$component.$store.reset_changes()
		);
		// under the three-dots menu
		this.page.add_menu_item(__("Change Facility"), () => {
			frappe.set_route("facility-builder");
		});

		// --- boot Vue (reactive side) ---
		this.app = createApp(FacilityBuilderComponent, { facility_name: facility });
		SetVueGlobals(this.app);
		this.app.use(VueKonva);
		this.$component = this.app.mount(this.$wrapper.get(0));

		// --- Vue → Frappe: reactive state drives the page chrome ---
		watch(
			() => this.$component.$store.dirty,
			(dirty) => {
				if (dirty.value) {
					this.page.set_indicator(__("Not Saved"), "orange");
					this.$reset_btn.show();
				} else {
					this.page.clear_indicator();
					this.$reset_btn.hide();
				}
			},
			{ deep: true }
		);
	}

	destroy() {
		this.app?.unmount();
		this.app = null;
	}
}

frappe.provide("frappe.ui");
frappe.ui.FacilityBuilder = FacilityBuilder;
export default FacilityBuilder;
