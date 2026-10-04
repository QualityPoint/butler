<template>
	<div class="fb-toolbar">
		<!-- Layer selector (Photoshop-style), styled as a segmented control: an inset
		     track with the active layer raised as a card, rather than three adjacent
		     buttons. Radio semantics, so it reads to a screen reader as one choice of
		     three and arrow keys move between them. -->
		<div
			class="fb-segmented"
			role="radiogroup"
			:aria-label="__('Layer')"
			@keydown.left.prevent="stepLayer(-1)"
			@keydown.right.prevent="stepLayer(1)"
		>
			<button
				v-for="layer in LAYERS"
				:key="layer.value"
				type="button"
				class="fb-segment"
				:class="{ 'fb-segment-on': store.active_layer.value === layer.value }"
				role="radio"
				:aria-checked="store.active_layer.value === layer.value"
				:tabindex="store.active_layer.value === layer.value ? 0 : -1"
				@click="store.set_active_layer(layer.value)"
			>
				{{ layer.label }}
			</button>
		</div>

		<!-- ===== BLUEPRINT LAYER ===== -->
		<template v-if="store.active_layer.value === 'blueprint'">
			<button class="btn btn-xs btn-default" :disabled="store.read_only.value" @click="uploadBlueprint">
				{{ store.active_blueprint_url.value ? __("Replace Blueprint") : __("Upload Blueprint") }}
			</button>

			<template v-if="store.active_blueprint_url.value">
				<div class="fb-toolbar-group" v-if="store.blueprint_page_count.value > 1">
					<label>{{ __("Page") }}</label>
					<select
						class="fb-input"
						:value="store.active_blueprint_page.value"
						:disabled="store.read_only.value"
						@change="store.set_blueprint_page($event.target.value)"
					>
						<option v-for="n in store.blueprint_page_count.value" :key="n" :value="n">{{ n }}</option>
					</select>
				</div>

				<div class="fb-toolbar-group">
					<label>{{ __("Opacity") }}</label>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						:value="store.active_blueprint.value?.opacity ?? 0.6"
						@input="store.set_blueprint_transform({ opacity: Number($event.target.value) })"
					/>
				</div>

				<button class="btn btn-xs btn-default" @click="store.request_blueprint_fit()">
					{{ __("Fit") }}
				</button>
				<button
					class="btn btn-xs"
					:class="store.calibrating.value ? 'btn-primary' : 'btn-default'"
					:disabled="store.read_only.value"
					@click="toggleCalibrate"
				>
					{{ __("Calibrate Scale") }}
				</button>
				<span v-if="store.calibrating.value" class="fb-hint">
					{{ __("Click two points on a known dimension…") }}
				</span>
			</template>
			<span v-else class="fb-hint">
				{{ __("Upload a blueprint for {0}", [store.active_floor_type.value || __("this floor")]) }}
			</span>
		</template>

		<!-- ===== FEATURES LAYER ===== -->
		<!-- Layer-wide controls only; what a single amenity contains is edited in the
		     sidebar panel, which has the room for it. -->
		<template v-else-if="store.active_layer.value === 'features'">
			<div class="d-flex align-items-center" :title="__('Draw each amenity\'s annexes on the plan')">
				<span style="color: var(--text-light); margin: 0px 6px;">{{ __("Icons") }}</span>
				<label class="switch">
					<input
						type="checkbox"
						:checked="store.show_annex_icons.value"
						@change="store.show_annex_icons.value = $event.target.checked"
					/>
					<span class="slider round"></span>
				</label>
			</div>

			<div class="fb-toolbar-group">
				<label>{{ __("Opacity") }}</label>
				<input
					type="range"
					min="0.1"
					max="1"
					step="0.05"
					:value="store.rooms_opacity.value"
					@input="store.set_rooms_opacity($event.target.value)"
				/>
			</div>

			<!-- Whole-facility, so it lives here rather than in a room's panel: the one device
			     serving every line of the default light system, on every room. -->
			<div
				v-if="store.default_light_system.value"
				class="fb-toolbar-group"
				:title="__('The device serving every {0} line in the facility', [__(store.default_light_system.value)])"
			>
				<label>{{ __("Default Light System Device") }}</label>
				<div class="fb-default-device" ref="defaultDeviceControl"></div>
			</div>

			<div class="fb-spacer" />

			<template v-if="room">
				<div class="fb-room-ident">
					<RoomAliasInput :room="room" />
					<span class="fb-room-meta">
						&middot; {{ __("{0} annexes", [store.effective_annexes(room).length]) }}
					</span>
				</div>
				<button
					class="btn btn-xs btn-default"
					:disabled="store.read_only.value || !similarCount"
					:title="__('Copy this amenity\'s annexes, light and sound onto every other placement of it')"
					@click="applyToSimilar"
				>
					{{ __("Apply to all like this") }}
					<span v-if="similarCount" class="text-muted">({{ similarCount }})</span>
				</button>
			</template>
			<span v-else class="fb-hint">
				{{ __("Select an amenity to configure it. Shapes are locked on this layer.") }}
			</span>
		</template>

		<!-- ===== DRAWING LAYER ===== -->
		<template v-else>
			<div class="d-flex align-items-center" :title="__('Snap to grid — turn off to trace freely over a blueprint')">
				<span style="color: var(--text-light); margin: 0px 6px;">{{ __("Snap") }}</span>
				<label class="switch">
					<input
						type="checkbox"
						:checked="store.snap_enabled.value"
						:disabled="store.read_only.value"
						@change="store.toggle_snap()"
					/>
					<span class="slider round"></span>
				</label>
			</div>

			<div class="fb-toolbar-group">
				<label>{{ __("Opacity") }}</label>
				<input
					type="range"
					min="0.1"
					max="1"
					step="0.05"
					:value="store.rooms_opacity.value"
					@input="store.set_rooms_opacity($event.target.value)"
				/>
			</div>

			<!-- active amenity being drawn -->
			<div class="fb-active-amenity" :title="__('Amenity being drawn')">
				<template v-if="activeAmenity">
					<span class="fb-avatar-sm" :style="activeAvatarStyle">
						<img v-if="activeAmenity.image" :src="activeAmenity.image" :alt="activeAmenity.amenity_name" />
						<template v-else>{{ activeInitials }}</template>
					</span>
					<span class="fb-active-name">{{ __(activeAmenity.amenity_name) }}</span>
				</template>
				<span v-else class="fb-hint">{{ __("Pick Amenity") }}</span>
			</div>

			<!-- The shape tools and the point styling live in ToolDock, floating over the
			     canvas on the right. -->

			<span v-if="store.active_tool.value === 'pen'" class="fb-hint">
				{{ penHint }}
			</span>

			<div class="fb-spacer" />

			<template v-if="room">
				<div class="fb-room-ident">
					<RoomAliasInput :room="room" />
					<span class="fb-room-meta">
						<template v-if="room.shape === 'line'">· {{ lineLength.toFixed(1) }} m</template>
						<template v-else-if="room.shape !== 'point'">· {{ room.area.toFixed(1) }} m²</template>
					</span>
				</div>
				<button class="btn btn-xs btn-danger" :disabled="store.read_only.value" @click="store.delete_room(room.id)">
					{{ __("Delete") }}
				</button>
			</template>
			<template v-else-if="store.selected_ids.value.length > 1">
				<span class="fb-room-label">{{ __("{0} selected", [store.selected_ids.value.length]) }}</span>
				<button class="btn btn-xs btn-danger" :disabled="store.read_only.value" @click="deleteSelection">
					{{ __("Delete") }}
				</button>
			</template>
		</template>
	</div>
</template>

<script setup>
import { inject, computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { room_length_m } from "../utils";
import RoomAliasInput from "./RoomAliasInput.vue";

const store = inject("$store");
const room = computed(() => store.selected_room.value);
// length (metres) of the selected line, for the toolbar readout
const lineLength = computed(() => (room.value ? room_length_m(room.value, store.ppm.value) : 0));
const LAYERS = [
	{ value: "blueprint", label: __("Blueprint") },
	{ value: "drawing", label: __("Drawing") },
	{ value: "features", label: __("Features") },
];

function stepLayer(delta) {
	const at = LAYERS.findIndex((l) => l.value === store.active_layer.value);
	const next = LAYERS[(at + delta + LAYERS.length) % LAYERS.length];
	store.set_active_layer(next.value);
}

// --- facility-wide default light system device (Features layer) -----------------------
// ToolDock's lifecycle: the host div sits behind the layer's v-if, so build the control
// when it appears, sync it behind a guard, and drop it when it goes.
const defaultDeviceControl = ref(null);
let defaultDeviceCtrl = null;

function ensureDefaultDeviceControl() {
	if (defaultDeviceCtrl || !defaultDeviceControl.value) return;
	defaultDeviceCtrl = frappe.ui.form.make_control({
		parent: defaultDeviceControl.value,
		df: {
			fieldtype: "Link",
			fieldname: "default_light_system_device",
			options: "Light System Device",
			placeholder: __("Device"),
			// only what the default system is configured with
			get_query: () => {
				const names = store
					.devices_for(store.default_light_system.value)
					.map((d) => d.device);
				return { filters: { name: ["in", names.length ? names : [""]] } };
			},
			onchange: () => {
				const picked = defaultDeviceCtrl.get_value() || null;
				if (picked === (store.default_light_system_device.value || null)) return; // programmatic sync
				// clearing falls back to the system's own default device
				store.set_default_light_system_device(picked);
				nextTick(syncDefaultDevice);
			},
		},
		render_input: true,
		only_input: true,
	});
	defaultDeviceCtrl.$input?.attr("disabled", store.read_only.value);
}
function destroyDefaultDeviceControl() {
	defaultDeviceCtrl?.$wrapper?.remove();
	defaultDeviceCtrl = null;
}
function syncDefaultDevice() {
	defaultDeviceCtrl?.set_value(store.default_light_system_device.value || "");
}

watch(
	() => store.active_layer.value === "features" && Boolean(store.default_light_system.value),
	(show) => {
		if (show) nextTick(() => { ensureDefaultDeviceControl(); syncDefaultDevice(); });
		else destroyDefaultDeviceControl();
	},
	{ immediate: true }
);
watch(() => store.default_light_system_device.value, () => nextTick(syncDefaultDevice));
onBeforeUnmount(destroyDefaultDeviceControl);

// how many OTHER placements of the selected amenity would a bulk apply touch
const similarCount = computed(() => {
	if (!room.value) return 0;
	let n = 0;
	for (const floor of store.design.value?.floors || []) {
		for (const r of floor.rooms || []) {
			if (r.id !== room.value.id && r.amenity === room.value.amenity) n++;
		}
	}
	return n;
});

function applyToSimilar() {
	// deliberately the amenity's name, not the room's alias: this acts on every placement
	// of the amenity, so "Copy the annexes of this Sara's Room onto the other 11" would
	// describe the wrong thing
	const amenity = __(room.value.amenity);
	frappe.confirm(
		__("Copy the annexes, light system and sound setting of this {0} onto the other {1}?",
			[amenity, __("{0} placements", [similarCount.value])]),
		() => {
			const touched = store.apply_features_to_similar(room.value.id);
			frappe.show_alert({
				message: __("Applied to {0} placements.", [touched]),
				indicator: "green",
			});
		}
	);
}
// active amenity indicator (avatar + name)
const activeAmenity = computed(() =>
	store.active_amenity.value ? store.amenity_index.value[store.active_amenity.value] : null
);
const activeInitials = computed(() =>
	__(activeAmenity.value?.amenity_name || "")
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase()
);
const activeAvatarStyle = computed(() => {
	const a = activeAmenity.value;
	if (a?.image) return {};
	const color = store.category_colors.value[a?.amenity_category] || "#aeb5bd";
	return { background: color };
});

function deleteSelection() {
	for (const id of [...store.selected_ids.value]) store.delete_room(id);
}

// guidance shown while the Freehand tool is active
const penHint = computed(() => {
	if (!store.active_amenity.value) return __("Pick an amenity to draw");
	if (store.pen_room_id.value) return __("Click to add points; double-click to finish");
	return __("Click on the canvas to start drawing the outline");
});

// distinct blueprint documents already attached to this facility (for reuse)
const existingBlueprints = computed(() => {
	const rows = store.facility.value?.blueprints || [];
	const seen = new Set();
	const out = [];
	for (const r of rows) {
		if (r.blueprint && !seen.has(r.blueprint)) {
			seen.add(r.blueprint);
			out.push({ label: r.blueprint.split("/").pop(), value: r.blueprint });
		}
	}
	return out;
});

function openUploader() {
	new frappe.ui.FileUploader({
		doctype: "Facility",
		docname: store.facility.value?.name,
		make_attachments_public: 0,
		restrictions: { allowed_file_types: ["image/*", ".pdf"] },
		on_success(file) {
			store.set_blueprint_file(file.file_url);
		},
	});
}

function uploadBlueprint() {
	const existing = existingBlueprints.value.filter((f) => f.value !== store.active_blueprint_url.value);
	if (!existing.length) {
		openUploader(); // nothing to reuse yet — upload directly
		return;
	}
	// a document already exists on this facility → let the user reuse it (no re-upload)
	const d = new frappe.ui.Dialog({
		title: __("Set Blueprint for {0}", [store.active_floor_type.value || ""]),
		fields: [
			{
				fieldtype: "Select",
				fieldname: "existing",
				label: __("Reuse a document already on this facility"),
				options: [{ label: "", value: "" }, ...existing],
				description: __("Pick a shared (multi-page) document, then choose this floor's page in the toolbar."),
			},
			{
				fieldtype: "Button",
				fieldname: "upload_new",
				label: __("Upload New Document"),
				click: () => {
					d.hide();
					openUploader();
				},
			},
		],
		primary_action_label: __("Use Selected"),
		primary_action({ existing: url }) {
			if (url) store.set_blueprint_file(url);
			d.hide();
		},
	});
	d.show();
}

function toggleCalibrate() {
	if (store.calibrating.value) store.cancel_calibration();
	else store.start_calibration();
}
</script>

<style scoped>
/* Segmented control, after Radix Themes' SegmentedControl at size 2: a low-contrast
   inset track, and the selected item raised on it as a small card. The distinction it
   draws is "which one of these am I in", which suits a layer switch better than three
   buttons where the active one is a saturated primary. */
.fb-segmented {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	padding: 2px;
	background: var(--control-bg);
	border-radius: var(--border-radius-md);
	box-shadow: inset 0 0 0 1px var(--border-color);
	flex-shrink: 0;
}
.fb-segment {
	appearance: none;
	border: 0;
	background: transparent;
	color: var(--text-muted);
	font-size: var(--text-sm);
	font-weight: 500;
	line-height: 1;
	height: 26px;
	padding: 0 12px;
	border-radius: calc(var(--border-radius-md) - 2px);
	cursor: pointer;
	white-space: nowrap;
	transition: background 100ms ease, color 100ms ease, box-shadow 100ms ease;
}
.fb-segment:hover:not(.fb-segment-on) {
	color: var(--text-color);
}
.fb-segment:focus-visible {
	outline: 2px solid var(--text-color); /* --primary never inverts; see FloorTabs */
	outline-offset: 1px;
}
/* The raised "thumb". Black rather than Radix's white card, matching the active floor
   tab in the quotation's line editor so "where you are" looks the same in both places.
   --btn-primary is Frappe's own near-black (gray-900), and pairing it with --bg-color for
   the text inverts correctly in dark mode, where the two swap to gray-300 on gray-900. */
.fb-segment-on {
	background: var(--btn-primary);
	color: var(--bg-color);
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}
.fb-segment-on:hover {
	color: var(--bg-color);
}
.fb-toolbar {
	display: flex;
	align-items: center;
	gap: 16px;
	height: 44px;
	flex-shrink: 0;
	box-sizing: border-box;
	padding: 0 var(--padding-md);
	border-bottom: 1px solid var(--border-color);
	background: var(--card-bg, #fff);
	font-size: var(--text-sm);
}
.fb-toolbar-group {
	display: flex;
	align-items: center;
	gap: 6px;
}
.fb-toolbar-group label {
	margin: 0;
	color: var(--text-light);
}
.fb-default-device {
	width: 11rem;
}
.fb-default-device :deep(.frappe-control) {
	margin-bottom: 0;
}
.fb-default-device :deep(.form-control) {
	height: 26px;
	font-size: var(--text-sm);
}
.fb-scale {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
.fb-input {
	width: 64px;
	height: 26px;
	border: 1px solid var(--border-color);
	/* form controls do not inherit either: unset, they render as the UA's white box with
	   black text, which survives dark mode as a bright rectangle */
	background: var(--control-bg);
	color: var(--text-color);
	border-radius: var(--border-radius);
	padding: 0 6px;
}
/* the empty label line is what pushed the input to the bottom — drop it */
/* centre the folder/selected icon on the input (Frappe rides it low by default) */
.fb-spacer {
	flex: 1;
}
.fb-room-label {
	font-weight: 600;
}
.fb-room-ident {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
}
/* the measurement beside the name: present, but never competing with it */
.fb-room-meta {
	color: var(--text-muted);
	white-space: nowrap;
}
.fb-active-amenity {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	max-width: 180px;
}
.fb-active-name {
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.fb-avatar-sm {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	color: #fff;
	font-size: var(--text-xs);
	font-weight: 600;
	background: var(--gray-400, #aeb5bd);
}
.fb-avatar-sm img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.fb-hint {
	color: var(--text-muted);
}
</style>
