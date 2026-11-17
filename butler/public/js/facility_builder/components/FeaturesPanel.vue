<template>
	<div class="fb-features">
		<div v-if="!room" class="fb-features-empty">
			{{ __("Select an amenity on the plan to configure what it contains.") }}
		</div>

		<template v-else>
			<div class="fb-features-head">
				<span class="fb-swatch" :style="{ background: swatch }"></span>
				<div class="fb-features-titles">
					<span class="fb-features-name">{{ __(room.amenity) }}</span>
					<span class="fb-features-sub">
						{{ __(room.category || "") }} &middot; {{ __(store.active_floor_type.value) }}
					</span>
				</div>
				<span
					v-if="customised"
					class="fb-chip"
					:title="__('This placement differs from the Amenity standard')"
					>{{ __("Customised") }}</span
				>
			</div>

			<!-- DEVICES — take the space that is left, and scroll when there is more. The
			     picker sits above the scroller rather than after the list, so its dropdown
			     is never clipped by it. -->
			<div class="fb-features-devices">
				<div class="fb-features-label">
					<span>
						<span class="fb-section-icon" v-html="ICONS.devices"></span>
						{{ __("Devices") }} <span class="fb-count">{{ devices.length }}</span></span>
					<button
						class="btn btn-xs btn-default fb-reset"
						:disabled="!customised || store.read_only.value"
						:title="__('Go back to the Amenity\'s standard composition')"
						@click="store.reset_room_features(room.id)"
					>
						{{ __("Reset") }}
					</button>
				</div>

				<div class="fb-add-device">
					<div ref="addControl"></div>
				</div>

				<!-- Two lines, so the name gets the full width and the controls get theirs.
				     One line only fits by squeezing the name to nothing at the sidebar's
				     240px, and widening the sidebar for this layer alone would shift the
				     canvas every time you switch to it. -->
				<div class="fb-device-list">
					<div
						v-for="a in devices"
						:key="a.device"
						class="fb-device"
						:class="{ 'fb-device-extra': a.extra }"
						:style="a.extra ? { '--fb-extra': EXTRA_DEVICE_COLOR } : null"
					>
						<div class="fb-device-top">
							<span class="fb-device-icon" v-html="iconFor(a)"></span>
							<span class="fb-device-name" :title="a.device_name">{{ __(a.device_name) }}</span>
							<!-- outside the name, so a truncated name never takes the mark with it -->
							<sup
								v-if="a.extra"
								class="fb-extra-mark"
								:title="__('Extra device — not part of this Amenity. Priced at its Standard Rate.')"
							>+</sup>
						</div>
						<div class="fb-device-controls">
							<!-- text, not number: Frappe's own Float and Int controls are text
							     inputs with an inputmode, which is why they carry no spinner.
							     `flt` parses in the user's number format, the same as they do. -->
							<input
								type="text"
								inputmode="decimal"
								class="fb-input fb-input-qty"
								:value="a.qty"
								:disabled="store.read_only.value"
								:title="__('Quantity')"
								@focus="$event.target.select()"
								@change="setQty(a, $event)"
							/>
							<!-- a plain select, not a Link: its popup is drawn by the browser
							     outside the document, so the scroller above cannot clip it -->
							<select
								class="fb-input fb-device-uom"
								:value="a.uom || ''"
								:disabled="store.read_only.value"
								:title="__('UOM')"
								@change="store.set_room_device(room.id, a.device, { uom: $event.target.value || null })"
							>
								<!-- a select with no matching option shows its first one, which
								     would claim a uom the room does not hold; the server picks
								     the Device Price's uom (or the Item's) for a blank one -->
								<option v-if="!a.uom" value="">{{ __("Default") }}</option>
								<option v-for="u in a.uoms" :key="u" :value="u">{{ u }}</option>
							</select>
							<button
								class="btn btn-xs fb-device-remove"
								:disabled="store.read_only.value || devices.length === 1"
								:title="devices.length === 1
									? __('An amenity needs at least one device. Remove the amenity itself instead.')
									: __('Remove')"
								@click="store.remove_room_device(room.id, a.device)"
								v-html="removeIcon"
							></button>
						</div>
					</div>
				</div>
			</div>

			<!-- Anchored to the bottom: the light system, and the sound system under it.
			     They are one choice each and always visible, however long the device list. -->
			<div class="fb-features-foot">
				<div class="fb-features-section">
					<div class="fb-features-label">
						<span>
							<span class="fb-section-icon" v-html="ICONS.light"></span>
							{{ __("Light System") }}</span>
					</div>
					<!-- Always shown. An amenity that configures no light systems is no
					     longer a dead end: any system in the master can be fitted to it,
					     priced from its own standard rate across every line. -->
					<div class="fb-light-field" ref="lightControl"></div>
					<div v-if="lightHint" class="fb-features-hint">{{ lightHint }}</div>
					<!-- Only for a system other than the default: the default system's lines
					     are served by one light system device for the whole facility, picked in the
					     toolbar. v-show, not v-if, so the control's host div is permanent. -->
					<div v-show="showLightSystemDevice" class="fb-features-sublabel">{{ __("Light System Device") }}</div>
					<div v-show="showLightSystemDevice" class="fb-light-field" ref="lightSystemDeviceControl"></div>
					<div v-if="showLightSystemDevice && lightSystemDeviceHint" class="fb-features-hint">{{ lightSystemDeviceHint }}</div>
				</div>

				<!-- Always offered: an Amenity with no sound price of its own is charged
				     Butler Settings' default when this is ticked. -->
				<div class="fb-features-section fb-features-divided">
					<div class="fb-features-label">
						<span>
							<span class="fb-section-icon" v-html="ICONS.sound"></span>
							{{ __("Sound System") }}</span>
					</div>
					<label class="fb-sound">
						<input
							type="checkbox"
							:checked="!!room.has_sound_system"
							:disabled="store.read_only.value"
							@change="store.set_room_features(room.id, { has_sound_system: $event.target.checked ? 1 : 0 })"
						/>
						<span>{{ __("Apply Sound System") }}</span>
					</label>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { EXTRA_DEVICE_COLOR, resolveColor } from "../colors";
import { keep_last_value } from "../utils";

const store = inject("$store");

const room = computed(() => (store.active_layer.value === "features" ? store.selected_room.value : null));
const options = computed(() => (room.value ? store.options_for(room.value.amenity) : {}));
const customised = computed(() => (room.value ? store.has_custom_features(room.value) : false));

// A room stores only which device and how much of it; the display name, icon and the UOMs
// it can be measured in come from the Amenity's list, or the extra device's details. A uom
// that list no longer offers is kept in the options anyway, so an older room never has
// its unit silently changed by merely being looked at.
const devices = computed(() => {
	if (!room.value) return [];
	return store.effective_devices(room.value).map((a) => {
		const source = store.device_details(room.value, a.device);
		const uoms = source.uoms || [];
		return {
			...a,
			device_name: source.device_name || a.device,
			icon: source.icon,
			uoms: a.uom && !uoms.includes(a.uom) ? [a.uom, ...uoms] : uoms,
			extra: store.is_extra_device(room.value, a.device),
		};
	});
});

const lightSystems = computed(() => options.value.light_systems || []);
const chosenLight = computed(() =>
	lightSystems.value.find((l) => l.system_name === room.value?.light_system)
);

// Built here rather than in the template: a Vue template resolves names against the
// component instance, and Frappe only registers `__` and `frappe` as global properties
// (SetVueGlobals, libs.bundle.js:8). `cint`/`flt`/`format_currency` live on `window`, so
// they work in this script's module scope but throw "_ctx.cint is not a function" the
// moment a template calls one.
const lightHint = computed(() => {
	const lines = cint(options.value.lines);
	// The field is seeded with the default, so empty only happens where no Light System is
	// marked default at all. Say that rather than showing nothing for something that is
	// always charged.
	if (!room.value?.light_system) return __("No default light system is set", []);

	const system = chosenLight.value;
	// Naming it keeps "this is just the default" distinguishable from "somebody chose
	// this", which the field alone cannot show once both look identical.
	const is_default = room.value.light_system === store.default_light_system.value;
	const note = is_default ? ` · ${__("default")}` : "";
	// Configured here: it takes the lines the Amenity says, and the default system fills
	// whatever is left over.
	if (system) {
		const used = cint(system.used_lines);
		const rest = lines - used;
		const covered = __("{0} of {1} lines", [used, lines]);
		return (
			(rest > 0 ? `${covered} · ` + __("default system fills {0}", [rest]) : covered) + note
		);
	}
	// Not configured here: nothing splits the lines, so it covers all of them.
	return __("All {0} lines, at its standard price", [lines]) + note;
});
// The light system device is a whole-facility concern (how many controllers to buy), not pricing — it
// never changes what this room costs. See docs/light_system_devices.md.
const showLightSystemDevice = computed(
	() =>
		Boolean(room.value?.light_system) &&
		room.value.light_system !== store.default_light_system.value
);
const lightSystemDeviceHint = computed(() => {
	const system = room.value?.light_system;
	const light_system_devices = store.light_system_devices_for(system);
	if (!light_system_devices.length) return __("{0} has no light system devices configured", [__(system)]);
	const light_system_device = light_system_devices.find(
		(d) => d.light_system_device === store.effective_light_system_device_for(room.value)
	);
	if (!light_system_device) return "";
	const channels = __("{0} channels per light system device", [cint(light_system_device.channels_count)]);
	// say when it is only following the system's default, so a later change to that
	// default is expected to move it
	return room.value?.light_system_device ? channels : `${channels} · ${__("default")}`;
});
const swatch = computed(() =>
	room.value ? resolveColor(room.value.category, store.category_colors.value) : "transparent"
);

// One fixed icon per section, built once at module scope: they never change, so there is
// nothing to recompute and nothing worth a computed. Rendered through frappe.utils.icon so
// they inherit `--icon-stroke` and follow the theme like every other icon in the desk.
const ICONS = {
	devices: frappe.utils.icon("package", "sm"),
	light: frappe.utils.icon("lightbulb", "sm"),
	sound: frappe.utils.icon("volume-2", "sm"),
};

// An icon rather than a `×` character: a glyph is centred on its font's baseline and
// x-height, so it always sits a little off-centre in a square button, however the box is
// aligned. A fixed-size SVG has no such metrics and lands dead centre.
const removeIcon = frappe.utils.icon("x", "xs");

// the same icon the canvas draws, so the panel and the plan agree; a lettered chip when
// the Device has none, matching RoomDevices' fallback
function iconFor(device) {
	if (device.icon) return frappe.utils.icon(device.icon, "sm");
	const initial = (device.device_name || device.device || "?").trim().charAt(0).toUpperCase();
	return `<span class="fb-device-initial">${frappe.utils.escape_html(initial)}</span>`;
}

// A quantity of zero (or less) is not a quantity — the server refuses it too
// (validate_row_types), and it would otherwise only surface as a save-time throw naming a
// row number nobody can map back to a room.
//
// Refusing is not enough on its own: the input is bound to the model, so if we simply
// ignore the edit the model never changes, Vue never re-renders, and the box goes on
// displaying a 0 that was never stored. Put the real value back, and say how to actually
// get rid of the device.
function setQty(device, event) {
	const qty = flt(event.target.value);
	if (qty > 0) {
		store.set_room_device(room.value.id, device.device, { qty });
		return;
	}
	event.target.value = device.qty;
	frappe.show_alert({
		message: __("A quantity has to be more than zero. Use \u00d7 to remove {0}.",
			[__(device.device_name)]),
		indicator: "orange",
	});
}

// --- mounted Frappe controls -----------------------------------------------------------
// The lifecycle rule from Toolbar.vue's icon picker: build once, sync programmatically
// behind a guard so the sync is never mistaken for a user edit, and remove the wrapper
// on teardown. Only the two pickers outside the device scroller are Frappe controls; the
// per-device UOM is a plain select, since a dropdown inside a scroller gets clipped by it.
const addControl = ref(null);
let addCtrl = null;
const lightControl = ref(null);
let lightCtrl = null;
const lightSystemDeviceControl = ref(null);
let lightSystemDeviceCtrl = null;

function ensureAddControl() {
	if (addCtrl || !addControl.value) return;
	addCtrl = frappe.ui.form.make_control({
		parent: addControl.value,
		df: {
			fieldtype: "Link",
			fieldname: "add_device",
			options: "Device",
			placeholder: __("Add device…"),
			// Every enabled device, minus what is already fitted. One outside this Amenity's
			// own list is an extra device: the quotation prices it at its Device's Standard
			// Rate, and it is marked in gold here and on the plan.
			get_query: () => {
				const fitted = devices.value.map((a) => a.device);
				return {
					filters: {
						disabled: 0,
						...(fitted.length ? { name: ["not in", fitted] } : {}),
					},
				};
			},
			onchange: () => {
				const device = addCtrl.get_value();
				if (!device) return;
				store.add_room_device(room.value.id, device);
				addCtrl.set_value("");
			},
		},
		render_input: true,
	});
}

// A Link to Light System over the WHOLE master, not just the systems this amenity
// configures. It used to be restricted, because anything outside that list had no
// configuration to price from and priced at nothing. That is no longer true: an
// unconfigured system is priced from its own master rate across all the amenity's lines,
// so every system in the catalogue is a legitimate choice for every amenity.
//
// Left empty, the row adopts the default system at save (price_light_system), so there is
// no "None" that means unlit — the placeholder says so.
function ensureLightControl() {
	if (lightCtrl || !lightControl.value) return;
	lightCtrl = frappe.ui.form.make_control({
		parent: lightControl.value,
		df: {
			fieldtype: "Link",
			fieldname: "light_system",
			options: "Light System",
			placeholder: __("Default"),
			onchange: () => {
				keep_last_value(lightCtrl); // so clearing it registers (utils.js)
				const picked = lightCtrl.get_value() || null;
				if (picked === (room.value?.light_system || null)) return; // programmatic sync
				// also resets the light system device to the new system's default
				store.set_room_light_system(room.value.id, picked);
			},
		},
		render_input: true,
		only_input: true,
	});
	lightCtrl.$input?.attr("disabled", store.read_only.value);
}

function syncLightControl() {
	lightCtrl?.set_value(room.value?.light_system || "");
}

// Only the light system devices configured on the room's own system — any other would have no channel
// count to divide by, and the server would swap it for the system's default anyway.
function ensureLightSystemDeviceControl() {
	if (lightSystemDeviceCtrl || !lightSystemDeviceControl.value) return;
	lightSystemDeviceCtrl = frappe.ui.form.make_control({
		parent: lightSystemDeviceControl.value,
		df: {
			fieldtype: "Link",
			fieldname: "light_system_device",
			options: "Light System Device",
			placeholder: __("Light System Device"),
			get_query: () => {
				const names = store.light_system_devices_for(room.value?.light_system).map((d) => d.light_system_device);
				// an empty `in` is not "nothing", so ask for a name that cannot exist
				return { filters: { name: ["in", names.length ? names : [""]] } };
			},
			onchange: () => {
				keep_last_value(lightSystemDeviceCtrl); // so clearing it registers (utils.js)
				const picked = lightSystemDeviceCtrl.get_value() || null;
				if (picked === store.effective_light_system_device_for(room.value)) return; // programmatic sync
				// only a light system device other than the system's default is stored as a pick; clearing,
				// or choosing the default, goes back to following the default
				store.set_room_light_system_device(room.value.id, picked);
				nextTick(syncLightSystemDeviceControl);
			},
		},
		render_input: true,
		only_input: true,
	});
	lightSystemDeviceCtrl.$input?.attr("disabled", store.read_only.value);
}

function syncLightSystemDeviceControl() {
	lightSystemDeviceCtrl?.set_value(store.effective_light_system_device_for(room.value) || "");
}

function destroyControls() {
	lightCtrl?.$wrapper?.remove();
	lightCtrl = null;
	lightSystemDeviceCtrl?.$wrapper?.remove();
	lightSystemDeviceCtrl = null;
	addCtrl?.$wrapper?.remove();
	addCtrl = null;
}

watch(
	() => room.value?.id,
	() => {
		if (!room.value) {
			destroyControls();
			return;
		}
		nextTick(() => {
			ensureAddControl();
			ensureLightControl();
			syncLightControl();
			ensureLightSystemDeviceControl();
			syncLightSystemDeviceControl();
		});
	},
	{ immediate: true }
);

// The light field's host div is now permanent — it used to be dropped for an amenity with
// no configured systems, which is why this once had to destroy the control alongside it.
// Kept as a mount, so the control still exists on first render and after a panel rebuild.
watch(
	() => room.value?.id,
	(id) => {
		// Selecting nothing swaps the panel's whole body for the empty state, taking the
		// host div with it. The control has to go too, or the rebuilt div would sit empty
		// behind `if (lightCtrl) return` the next time an amenity is selected.
		if (!id) {
			lightCtrl?.$wrapper?.remove();
			lightCtrl = null;
			lightSystemDeviceCtrl?.$wrapper?.remove();
			lightSystemDeviceCtrl = null;
			return;
		}
		nextTick(() => {
			ensureLightControl();
			syncLightControl();
			ensureLightSystemDeviceControl();
			syncLightSystemDeviceControl();
		});
	},
	{ immediate: true }
);

// a light system changed elsewhere (Reset, Apply to all) still has to reach its control —
// set_value alone, never a re-render, so the guard in onchange stays honest
watch(() => room.value?.light_system, () => nextTick(syncLightControl));
watch(() => room.value?.light_system_device, () => nextTick(syncLightSystemDeviceControl));

onBeforeUnmount(destroyControls);
</script>

<style scoped>
/* Three zones down the sidebar: the head, the devices taking whatever is left, and the
   light + sound systems pinned to the bottom. Only the device list scrolls. */
.fb-features {
	display: flex;
	flex-direction: column;
	gap: var(--margin-sm);
	flex: 1;
	min-height: 0;
	/* NOT overflow-y:auto — CSS forces the other axis to `auto` alongside it, which makes
	   this a clipping box and cuts every Link dropdown off at the sidebar edge. No
	   z-index escapes an overflow clip. The scroll belongs on the device list alone, and
	   nothing with a dropdown goes inside it. */
	overflow: visible;
}
.fb-features-devices {
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex: 1;
	min-height: 0;
}
.fb-device-list {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	/* A scroller is a clipping box on both axes, so anything flush with its edge loses a
	   pixel — which is exactly the inputs' side borders. Keep a hair of room inside it,
	   and pull the same amount back off the outside so the rows still line up with the
	   section above them. */
	padding: 2px 3px;
	margin: -2px -3px;
}
.fb-features-foot {
	display: flex;
	flex-direction: column;
	gap: var(--margin-sm);
	padding-top: var(--margin-sm);
	border-top: 1px solid var(--border-color);
}
/* the sound system is its own choice, not part of the light system's block */
.fb-features-divided {
	padding-top: var(--margin-sm);
	border-top: 1px solid var(--border-color);
}
.fb-features-empty,
.fb-features-none {
	color: var(--text-muted);
	font-size: var(--text-sm);
}
.fb-features-head {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding-bottom: var(--margin-sm);
	border-bottom: 1px solid var(--border-color);
}
.fb-features-titles {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	flex: 1;
}
.fb-swatch {
	width: 12px;
	height: 12px;
	margin-top: 3px;
	border-radius: 3px;
	flex-shrink: 0;
	border: 1px solid var(--border-color);
}
.fb-count {
	display: inline-block;
	min-width: 16px;
	padding: 0 5px;
	border-radius: 8px;
	background: var(--subtle-accent);
	color: var(--text-muted);
	font-size: var(--text-xs);
	text-align: center;
}
/* no `color` — the icon keeps whatever colours it was drawn with, the same as on the
   canvas, so the panel and the plan show the same thing */
.fb-device-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 18px;
}
.fb-device-initial {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	border: 1px solid var(--text-muted);
	border-radius: 50%;
	font-size: 9px;
	font-weight: 600;
	line-height: 1;
}
.fb-features-name {
	font-weight: 600;
}
.fb-features-sub {
	color: var(--text-muted);
	font-size: var(--text-sm);
}
.fb-chip {
	align-self: flex-start;
	flex-shrink: 0;
	background: var(--yellow-100, #fef3c7);
	color: var(--yellow-700, #a16207);
	padding: 0 6px;
	border-radius: 8px;
	font-size: var(--text-xs);
}
.fb-features-section {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.fb-features-label {
	display: flex;
	align-items: center;
	justify-content: space-between;
	color: var(--text-light);
	font-size: var(--text-sm);
}
/* the label's own text sits beside its icon; anything after it (Reset) stays pushed right
   by the justify-content above */
.fb-features-label > span:first-child {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}
.fb-section-icon {
	display: inline-flex;
	flex-shrink: 0;
}
/* v-html content carries no scope attribute, hence :deep; block so the icon centres on the
   label rather than sitting on its text baseline */
.fb-section-icon :deep(.icon) {
	display: block;
	margin: 0;
}
.fb-features-hint {
	color: var(--text-muted);
	font-size: var(--text-xs);
}
.fb-features-sublabel {
	color: var(--text-light);
	font-size: var(--text-xs);
	margin-top: 2px;
}
.fb-device {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 6px 0;
	border-bottom: 1px solid var(--border-color);
}
.fb-device:last-of-type {
	border-bottom: 0;
}
.fb-device-top {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}
/* flush with the icon above it, not indented under the name — the row is one block, and
   the extra 24px is width the UOM select needs at a 240px sidebar */
.fb-device-controls {
	display: flex;
	align-items: center;
	gap: 6px;
}
.fb-device-uom {
	flex: 1;
	min-width: 0;
	font-size: var(--text-sm);
}
.fb-device-name {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: var(--text-sm);
}
/* An extra device — fitted from outside the Amenity's own list — in gold, the colour it
   has on the plan (EXTRA_DEVICE_COLOR, passed in as --fb-extra): a gold edge, name and
   icon, and a superscript "+" right after the name rather than pushed to the far end. */
.fb-device-extra {
	border-left: 3px solid var(--fb-extra);
	padding-left: 6px;
}
.fb-device-extra .fb-device-icon,
.fb-device-extra .fb-device-name {
	color: var(--fb-extra);
}
.fb-device-extra .fb-device-name {
	flex: 0 1 auto;
	font-weight: 600;
}
.fb-device-extra .fb-device-initial {
	border-color: var(--fb-extra);
}
.fb-extra-mark {
	margin-right: auto;
	color: var(--fb-extra);
	font-size: var(--text-sm);
	font-weight: 700;
	cursor: help;
}
/* the same 26px box as the qty and uom controls beside it, so the three sit on one line */
.fb-device-remove {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: 26px;
	height: 26px;
	padding: 0;
	--icon-stroke: var(--red-500, #e03636);
	/* a wash rather than a solid fill — one of these sits in every device row, and a column
	   of full-strength red reads as a column of warnings. Stated in rgba, not a --red-*
	   token, because the transparency is the point: it has to tint whatever is behind it. */
	background: rgba(224, 54, 54, 0.12);
	border: 1px solid rgba(224, 54, 54, 0.28);
	border-radius: var(--radius-sm, 4px);
}
.fb-device-remove:hover:not(:disabled),
.fb-device-remove:focus:not(:disabled) {
	background: rgba(224, 54, 54, 0.24);
	border-color: rgba(224, 54, 54, 0.5);
}
/* the last device cannot go — an amenity is what it is composed of — so the button reads
   as unavailable rather than as a live red one that happens not to work */
.fb-device-remove:disabled {
	--icon-stroke: var(--text-muted);
	background: var(--control-bg);
	border-color: var(--border-color);
	opacity: 1;
}
/* v-html content carries no scope attribute, hence :deep; block kills the inline
   baseline gap that would push the glyph off centre */
.fb-device-remove :deep(.icon) {
	display: block;
	margin: 0;
}
.fb-input {
	height: 26px;
	border: 1px solid var(--border-color);
	border-radius: var(--radius, 8px);
	background: var(--control-bg);
	padding: 0 6px;
	/* form controls do not inherit `color`: unset, the text stays the UA's black on a
	   background that is near-black in dark mode */
	color: var(--text-color);
}
/* right-aligned like every numeric field in Frappe, so the digits line up column-wise
   however many of them there are */
.fb-input-qty {
	width: 56px;
	flex-shrink: 0;
	text-align: right;
	font-size: var(--text-sm);
}
.fb-sound {
	display: flex;
	align-items: center;
	gap: 6px;
	margin: 0;
	font-weight: normal;
	cursor: pointer;
}
.fb-add-device :deep(.frappe-control),
.fb-light-field :deep(.frappe-control) {
	margin-bottom: 0;
}
.fb-add-device :deep(.form-control),
.fb-light-field :deep(.form-control) {
	height: 26px;
	font-size: var(--text-sm);
}
.fb-add-device :deep(.control-label),
.fb-add-device :deep(.help-box),
.fb-light-field :deep(.control-label),
.fb-light-field :deep(.help-box) {
	display: none;
}
/* The light field is the last thing before the sidebar's bottom edge, so its list opens
   upward — awesomplete sets no `top`, it just falls below the input, and there is no room
   left below for it to fall into. */
.fb-light-field :deep(.awesomplete > ul) {
	top: auto;
	bottom: 100%;
	margin-bottom: 2px;
	max-height: 40vh;
}
</style>
