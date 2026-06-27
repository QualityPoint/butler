<template>
	<div class="fb-toolbar">
		<!-- layer selector (Photoshop-style) -->
		<div class="btn-group" role="group">
			<button
				class="btn btn-xs"
				:class="store.active_layer.value === 'blueprint' ? 'btn-primary' : 'btn-default'"
				@click="store.set_active_layer('blueprint')"
			>
				{{ __("Blueprint") }}
			</button>
			<button
				class="btn btn-xs"
				:class="store.active_layer.value === 'drawing' ? 'btn-primary' : 'btn-default'"
				@click="store.set_active_layer('drawing')"
			>
				{{ __("Drawing") }}
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

			<!-- shape-tool strip: flat icons; only the active tool wears the button box -->
			<div class="fb-tools">
				<button
					v-for="t in tools"
					:key="t.key"
					class="btn btn-xs fb-tool"
					:class="{ 'fb-tool-active': store.active_tool.value === t.key }"
					:title="t.label"
					:disabled="store.read_only.value"
					@click="store.set_active_tool(t.key)"
					v-html="t.svg"
				></button>
			</div>

			<!-- point styling — when the Point tool is active OR a point is selected -->
			<div class="fb-toolbar-group fb-point-style" v-show="pointActive">
				<div ref="iconControl" class="fb-icon-field"></div>
				<input
					type="color"
					class="fb-color"
					:value="pointColor"
					:disabled="store.read_only.value"
					:title="__('Colour')"
					@input="setPointColor"
				/>
				<input
					type="number"
					min="8"
					max="96"
					class="fb-input fb-input-sm"
					:value="pointSize"
					:disabled="store.read_only.value"
					:title="__('Size (px)')"
					@change="setPointSize"
				/>
			</div>

			<span v-if="store.active_tool.value === 'pen'" class="fb-hint">
				{{ penHint }}
			</span>

			<div class="fb-spacer" />

			<template v-if="room">
				<div class="fb-toolbar-group">
					<span class="fb-room-label">
						{{ __(room.amenity)
						}}<template v-if="room.shape === 'line'"> · {{ lineLength.toFixed(1) }} m</template
						><template v-else-if="room.shape !== 'point'"> · {{ room.area.toFixed(1) }} m²</template>
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
import { inject, computed, ref, watch, nextTick, onBeforeUnmount } from "vue";
import { room_length_m } from "../utils";

const store = inject("$store");
const room = computed(() => store.selected_room.value);
// length (metres) of the selected line, for the toolbar readout
const lineLength = computed(() => (room.value ? room_length_m(room.value, store.ppm.value) : 0));
const isDrawing = computed(() => store.active_layer.value === "drawing");
// the point controls edit the selected point if there is one, else the tool's defaults
const pointRoom = computed(() => (room.value?.shape === "point" ? room.value : null));
// show the point style controls when drawing points OR when a point is selected to edit
const pointActive = computed(() => store.active_tool.value === "point" || !!pointRoom.value);
const pointColor = computed(
	() => pointRoom.value?.color || store.point_style.value.color || "#2490ef"
);
const pointSize = computed(() => pointRoom.value?.size || store.point_style.value.size || 24);

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

// shape tools — icon glyphs (theme-colored via currentColor), tooltip carries the name
const SVG = (body) =>
	`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
const tools = [
	{
		key: "select",
		label: __("Select"),
		svg: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M5 3 L5 19 L9 15 L11.5 20 L13.5 19 L11 14 L16 14 Z"/></svg>`,
	},
	{ key: "line", label: __("Line"), svg: SVG(`<line x1="4" y1="20" x2="20" y2="4"/>`) },
	{ key: "rect", label: __("Rectangle"), svg: SVG(`<rect x="4" y="6" width="16" height="12"/>`) },
	{ key: "ellipse", label: __("Ellipse"), svg: SVG(`<ellipse cx="12" cy="12" rx="9" ry="6"/>`) },
	{ key: "triangle", label: __("Triangle"), svg: SVG(`<polygon points="12,4 21,20 3,20"/>`) },
	{ key: "pentagon", label: __("Pentagon"), svg: SVG(`<polygon points="12,3 21,10 17,21 7,21 3,10"/>`) },
	{ key: "hexagon", label: __("Hexagon"), svg: SVG(`<polygon points="7,4 17,4 22,12 17,20 7,20 2,12"/>`) },
	{ key: "pen", label: __("Freehand"), svg: SVG(`<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>`) },
	{
		key: "point",
		label: __("Point"),
		svg: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>`,
	},
];

// inline Frappe Icon picker — mounted beside the Point tool while it's active
const iconControl = ref(null);
let iconCtrl = null;

const currentIcon = () => pointRoom.value?.icon ?? store.point_style.value.icon ?? null;

function applyPoint(patch) {
	if (pointRoom.value) store.set_point_style(pointRoom.value.id, patch);
	else store.set_point_defaults(patch);
}
function onIconChange() {
	const v = iconCtrl.get_value() || null;
	if (v === currentIcon()) return; // ignore programmatic sync
	applyPoint({ icon: v });
}
function ensureIconControl() {
	if (iconCtrl || !iconControl.value) return;
	iconCtrl = frappe.ui.form.make_control({
		parent: iconControl.value,
		df: { fieldtype: "Icon", fieldname: "point_icon", placeholder: __("Icon"), onchange: onIconChange },
		render_input: true,
	});
}
function destroyIconControl() {
	iconCtrl?.$wrapper?.remove();
	iconCtrl = null;
}
function syncIcon() {
	if (iconCtrl) iconCtrl.set_value(currentIcon() || "");
}

watch(
	() => pointActive.value && isDrawing.value && !store.read_only.value,
	(show) => {
		if (show) nextTick(() => { ensureIconControl(); syncIcon(); });
		else destroyIconControl();
	},
	{ immediate: true }
);
// keep the picker in step when switching points or changing the default
watch(
	() => [pointRoom.value?.id, pointRoom.value?.icon, store.point_style.value.icon],
	() => syncIcon()
);

onBeforeUnmount(destroyIconControl);

function setPointColor(e) {
	applyPoint({ color: e.target.value });
}
function setPointSize(e) {
	applyPoint({ size: Math.max(8, Number(e.target.value) || 24) });
}

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
.fb-scale {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
.fb-input {
	width: 64px;
	height: 26px;
	border: 1px solid var(--border-color);
	border-radius: var(--border-radius);
	padding: 0 6px;
}
.fb-input-sm {
	width: 52px;
}
.fb-tools {
	display: inline-flex;
	align-items: center;
	gap: 2px;
}
/* flat by default — just the glyph, no button chrome; keeps .btn-xs metrics so it
   matches the Icon button's height/padding exactly */
.fb-tool {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-color: transparent;
	background: transparent;
	box-shadow: none;
	color: var(--text-muted);
}
.fb-tool:hover:not(:disabled) {
	color: var(--text-color);
}
/* only the active tool gets a gray button box */
.fb-tool-active,
.fb-tool-active:hover {
	border-color: var(--gray-300, #d1d8dd);
	background: var(--gray-200, #e2e6e9);
	color: var(--text-color);
}
.fb-color {
	width: 28px;
	height: 26px;
	padding: 0;
	border: 1px solid var(--border-color);
	border-radius: var(--border-radius);
	background: none;
	cursor: pointer;
}
.fb-point-style {
	align-items: center;
}
.fb-icon-field {
	width: 130px;
	display: flex;
	align-items: center;
}
.fb-icon-field :deep(.frappe-control),
.fb-icon-field :deep(.form-group),
.fb-icon-field :deep(.control-input-wrapper),
.fb-icon-field :deep(.control-input) {
	margin: 0 !important;
	padding: 0 !important;
	width: 100%;
}
/* the empty label line is what pushed the input to the bottom — drop it */
.fb-icon-field :deep(.clearfix),
.fb-icon-field :deep(.control-label),
.fb-icon-field :deep(.help-box) {
	display: none !important;
}
.fb-icon-field :deep(.control-input) {
	position: relative;
	height: 26px;
}
.fb-icon-field :deep(input) {
	height: 26px;
	min-height: 26px;
}
/* centre the folder/selected icon on the input (Frappe rides it low by default) */
.fb-icon-field :deep(.selected-icon) {
	top: 50% !important;
	transform: translateY(-50%);
}
.fb-spacer {
	flex: 1;
}
.fb-room-label {
	font-weight: 600;
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
