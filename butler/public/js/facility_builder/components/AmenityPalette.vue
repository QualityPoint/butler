<template>
	<div class="fb-palette">
		<!-- ===== Filters ===== -->
		<div class="fb-filters">
			<div class="fb-field">
				<label>{{ __("Order Type") }}</label>
				<select
					class="fb-input"
					:value="store.order_type.value"
					:disabled="store.read_only.value"
					@change="store.set_order_type($event.target.value)"
				>
					<option value="Amenities">{{ __("Amenities") }}</option>
					<option value="Bundle">{{ __("Bundle") }}</option>
					<option value="Quotation">{{ __("Quotation") }}</option>
				</select>
			</div>

			<div class="fb-field" v-if="store.order_type.value === 'Bundle'">
				<label>
					{{ __("Bundle") }} <span class="fb-req">*</span>
				</label>
				<select
					class="fb-input"
					:class="{ 'fb-input-error': !store.bundle_type.value }"
					:value="store.bundle_type.value || ''"
					:disabled="store.read_only.value"
					@change="store.set_bundle_type($event.target.value)"
				>
					<option value="">{{ __("Select Bundle") }}</option>
					<option v-for="b in bundles" :key="b.name" :value="b.name">
						{{ b.bundle_name }}
					</option>
				</select>
			</div>

		</div>

		<div class="fb-palette-head">
			<span class="fb-palette-title">{{ __("Filters") }}</span>
		</div>

		<div class="fb-filters">
			<div class="fb-field">
				<div ref="managerControl"></div>
			</div>

			<div class="fb-field">
				<div ref="categoryControl"></div>
			</div>

			<div class="fb-field">
				<div ref="amenityControl"></div>
			</div>
		</div>

		<!-- ===== View toggle ===== -->
		<div class="fb-palette-head">
			<span class="fb-palette-title">{{ __("Amenities") }}</span>
		</div>

		<!-- ===== Amenity list ===== -->
		<div
			v-if="store.order_type.value === 'Bundle' && !store.bundle_type.value"
			class="fb-palette-empty"
		>
			{{ __("Select a bundle to see its amenities.") }}
		</div>
		<p v-else-if="!amenities.length" class="fb-palette-empty">
			{{ __("No amenities match the current filters.") }}
		</p>

		<div v-else class="fb-amenity-list">
			<div
				v-for="a in amenities"
				:key="a.name"
				class="fb-amenity"
				:class="{
					'fb-amenity-disabled': isDisabled(a),
					'fb-amenity-active': store.active_amenity.value === a.name,
				}"
				:title="pickTitle(a)"
				@click="onPick(a)"
			>
				<span class="fb-avatar" :style="avatarStyle(a)">
					<img v-if="a.image" :src="a.image" :alt="__(a.amenity_name)" loading="lazy" />
					<template v-else>{{ initials(__(a.amenity_name)) }}</template>
				</span>
				<div class="fb-amenity-body">
					<span class="fb-amenity-name">{{ __(a.amenity_name) }}</span>
					<span class="fb-amenity-meta">{{ __(a.amenity_category) }}</span>
				</div>
				<span v-if="isFull(a)" class="fb-amenity-badge">{{ __("Full") }}</span>
				<!-- a shortfall is a cue, never a block: unlike Full it must not reach
				     isDisabled, because drawing more is one of the two ways to fix it -->
				<span v-else-if="needsPrimary(a)" class="fb-amenity-badge fb-amenity-badge-warn">
					{{ __("Needs primary") }}
				</span>
			</div>
		</div>

		<p v-if="!store.read_only.value" class="fb-palette-hint">
			{{ __("Pick an amenity, then draw it on the canvas.") }}
		</p>
	</div>
</template>

<script setup>
import { inject, computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import { colorFor as hashColor } from "../colors";
import { keep_last_value } from "../utils";

const store = inject("$store");

const bundles = ref([]);
const categoryControl = ref(null);
const managerControl = ref(null);
let managerCtrl = null;
const amenityControl = ref(null);
let catCtrl = null;
let amenityCtrl = null;

const amenities = computed(() => store.filtered_amenities.value);

function colorFor(category) {
	return store.category_colors.value[category] || hashColor(category);
}

function initials(name) {
	return (name || "")
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();
}

// initials avatar gets the category color; image avatars don't need a background
function avatarStyle(a) {
	return a.image ? {} : { background: colorFor(a.amenity_category) };
}

function isFull(a) {
	return store.category_is_full(a.amenity_category);
}
function isDisabled(a) {
	// deliberately NOT `needsPrimary`: a dependency shortfall is fixed either by drawing
	// more primaries or fewer dependants, so greying the entry out would remove one of
	// the two ways out of it
	return store.read_only.value || isFull(a);
}
function needsPrimary(a) {
	return store.amenity_is_short(a.name);
}
function pickTitle(a) {
	if (store.read_only.value) return __("Read only");
	if (isFull(a)) return __("This category is full for the selected bundle");
	if (needsPrimary(a)) {
		return __("Every {0} needs its own {1}. Draw more of them, or remove some {0}.", [
			__(a.amenity_name),
			store.primaries_for(a.name).map((p) => __(store.amenity_label(p))).join(", "),
		]);
	}
	return __("Pick to draw on the canvas");
}

// clicking an amenity makes it the active one drawn onto the canvas
function onPick(a) {
	if (isDisabled(a)) return;
	store.set_active_amenity(store.active_amenity.value === a.name ? null : a.name);
}

// MultiSelectList controls (as in a Frappe report filter). Anchor the Bootstrap
// dropdown under the input (data-display=static) so it doesn't fly to the page's
// far-left / hide behind the desk sidebar inside our narrow panel.
function make_filter(parent, fieldname, placeholder, get_data, onchange) {
	const ctrl = frappe.ui.form.make_control({
		parent,
		df: { fieldtype: "MultiSelectList", fieldname, placeholder, get_data, onchange },
		render_input: true,
	});
	ctrl.$list_wrapper?.find('[data-toggle="dropdown"]').attr("data-display", "static");
	ctrl.$input_area?.find("input").attr("disabled", store.read_only.value);
	return ctrl;
}

onMounted(() => {
	frappe.db.get_list("Butler Bundle", { fields: ["name", "bundle_name"], limit: 0 }).then(
		(rows) => (bundles.value = rows)
	);

	catCtrl = make_filter(
		categoryControl.value,
		"amenity_categories_filter",
		__("Amenity Category"),
		// every Amenity Category record — a filter offers the master records, not only
		// what is linked or in scope
		() =>
			store.categories.value.map((c) => ({
				value: c.name,
				label: __(c.category_name || c.name),
				description: "",
			})),
		() => store.set_selected_categories(catCtrl.get_value())
	);

	// Butler Manager, the top filter and a MultiSelectList like Amenity Category: every
	// Butler Manager record, each with its amenity count in the order / bundle scope. MultiSelectList writes `label`
	// straight into its HTML, so the name is escaped.
	managerCtrl = make_filter(
		managerControl.value,
		"butler_managers_filter",
		__("Butler Manager"),
		() =>
			store.available_managers.value.map((m) => ({
				value: m.name,
				label: frappe.utils.escape_html(m.label),
				description: __("{0} amenities", [m.count]),
			})),
		() => store.set_selected_managers(managerCtrl.get_value())
	);

	// Amenity filter is a single Link over every enabled Amenity record (a disabled one can't
	// be drawn); the other filters narrow the palette list, not this field's options
	amenityCtrl = frappe.ui.form.make_control({
		parent: amenityControl.value,
		df: {
			fieldtype: "Link",
			fieldname: "amenity_filter",
			options: "Amenity",
			placeholder: __("Amenity"),
			get_query: () => ({
				filters: { disabled: 0 },
			}),
			onchange: () => {
				keep_last_value(amenityCtrl); // so clearing the filter registers (utils.js)
				store.set_selected_amenity(amenityCtrl.get_value());
			},
		},
		render_input: true,
	});
	amenityCtrl.$input?.attr("disabled", store.read_only.value);
});

// order/bundle change → store clears both filters; mirror in the controls
watch(
	() => [store.order_type.value, store.bundle_type.value],
	() => {
		catCtrl?.set_value([]);
		managerCtrl?.set_value([]);
		amenityCtrl?.set_value("");
	}
);
// narrowing categories or managers resets the amenity filter (store already cleared it)
watch(
	() => [store.selected_categories.value, store.selected_managers.value],
	() => amenityCtrl?.set_value("")
);

onBeforeUnmount(() => {
	catCtrl?.$wrapper?.remove();
	managerCtrl?.$wrapper?.remove();
	amenityCtrl?.$wrapper?.remove();
});
</script>

<style scoped>
.fb-palette {
	display: flex;
	flex-direction: column;
	gap: 10px;
	flex: 1;
	min-height: 0;
}
.fb-filters {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.fb-field {
	display: flex;
	flex-direction: column;
	gap: 3px;
}
/* strip the Frappe control's default form-group margins so the filters sit close */
.fb-field :deep(.frappe-control),
.fb-field :deep(.form-group) {
	margin: 0 !important;
}
.fb-field :deep(.help-box),
.fb-field :deep(.control-label:empty) {
	display: none;
}
.fb-field label {
	margin: 0;
	font-size: var(--text-xs);
	color: var(--text-light);
}
.fb-req {
	color: var(--red-500, #e24c4c);
}
.fb-input {
	width: 100%;
	height: 28px;
	border: 1px solid var(--border-color);
	border-radius: var(--border-radius);
	padding: 0 6px;
	background: var(--card-bg, #fff);
	/* form controls do not inherit `color`: unset, the text stays the UA's black on a
	   background that is near-black in dark mode */
	color: var(--text-color);
}
.fb-input-error {
	border-color: var(--red-500, #e24c4c);
}

/* keep the category multiselect's dropdown anchored under the field + above the canvas */
.fb-field :deep(.multiselect-list) {
	width: 100%;
}
/* No max-height / overflow here: Frappe already scrolls the option list inside the
   dropdown (.selectable-items, common/controls.scss), keeping the search box and the
   Select all / Clear buttons fixed around it. Scrolling the whole menu as well gave two
   nested scrollbars. min-width: Frappe's `.multiselect-list ul` asks for 300px, wider
   than this 240px sidebar. */
.fb-field :deep(.multiselect-list .dropdown-menu) {
	width: 100%;
	min-width: 200px;
	z-index: 1000;
}

.fb-palette-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	border-top: 1px solid var(--border-color);
	padding-top: 8px;
}
.fb-palette-title {
	font-weight: 600;
}
.fb-palette-empty,
.fb-palette-hint {
	font-size: var(--text-xs);
	color: var(--text-muted);
}
.fb-palette-hint {
	margin-top: 4px;
}

.fb-amenity-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding-right: 2px;
}

.fb-amenity {
	display: flex;
	align-items: center;
	gap: 8px;
	border: 1px solid var(--border-color);
	border-radius: var(--border-radius);
	padding: 6px 8px;
	background: var(--card-bg, #fff);
	cursor: pointer;
	font-size: var(--text-sm);
	user-select: none;
	min-width: 0;
}
.fb-amenity:hover {
	border-color: var(--gray-400, #aeb5bd);
}
.fb-amenity-active {
	/* the #2490ef fallback never applied — --primary is defined (#171717) and never
	   redefined for dark mode, so the selected amenity's ring was black on a dark list */
	border-color: var(--text-color);
	box-shadow: 0 0 0 1px var(--text-color) inset;
	background: var(--bg-blue, #f0f7ff);
}
.fb-amenity-disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.fb-avatar {
	width: 34px;
	height: 34px;
	border-radius: 50%;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	color: #fff;
	font-size: var(--text-xs);
	font-weight: 600;
	background: var(--gray-400, #aeb5bd);
}
.fb-avatar img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.fb-amenity-body {
	display: flex;
	flex-direction: column;
	min-width: 0;
	flex: 1;
}
.fb-amenity-name {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.fb-amenity-meta {
	font-size: var(--text-xs);
	color: var(--text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.fb-amenity-badge {
	font-size: var(--text-xs);
	color: #fff;
	background: var(--gray-500, #6b7280);
	border-radius: 8px;
	padding: 0 6px;
	flex-shrink: 0;
}
/* amber, not grey: this one is a warning about the plan, not a closed door */
.fb-amenity-badge-warn {
	color: var(--orange-600, #b7791f);
	background: var(--orange-100, #fefcbf);
	white-space: nowrap;
}
</style>
