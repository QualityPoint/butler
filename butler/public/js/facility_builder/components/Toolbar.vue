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
			<button class="btn btn-xs btn-default" @click="uploadBlueprint">
				{{ store.active_blueprint_url.value ? __("Replace Blueprint") : __("Upload Blueprint") }}
			</button>

			<template v-if="store.active_blueprint_url.value">
				<div class="fb-toolbar-group" v-if="store.blueprint_page_count.value > 1">
					<label>{{ __("Page") }}</label>
					<select
						class="fb-input"
						:value="store.active_blueprint_page.value"
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

			<div class="fb-spacer" />

			<template v-if="room">
				<div class="fb-toolbar-group">
					<span class="fb-room-label">
						{{ room.space_type }} · {{ room.area.toFixed(1) }} m²
						<span class="fb-shape-tag">{{ room.shape }}</span>
					</span>
				</div>
				<div class="btn-group" role="group">
					<button class="btn btn-xs" :class="room.shape !== 'polygon' ? 'btn-primary' : 'btn-default'" @click="setShape('rect')">
						{{ __("Rectangle") }}
					</button>
					<button class="btn btn-xs" :class="room.shape === 'polygon' ? 'btn-primary' : 'btn-default'" @click="setShape('polygon')">
						{{ __("Polygon") }}
					</button>
				</div>
				<button class="btn btn-xs btn-danger" @click="store.delete_room(room.id)">
					{{ __("Delete") }}
				</button>
			</template>
			<span v-else class="fb-hint">{{ __("Select a Space to edit it") }}</span>
		</template>
	</div>
</template>

<script setup>
import { inject, computed } from "vue";

const store = inject("$store");
const room = computed(() => store.selected_room.value);

function setShape(shape) {
	if (!room.value) return;
	if (shape === "polygon" && room.value.shape !== "polygon") {
		store.convert_to_polygon(room.value.id);
	} else if (shape === "rect" && room.value.shape === "polygon") {
		store.convert_to_rectangle(room.value.id);
	}
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
.fb-spacer {
	flex: 1;
}
.fb-room-label {
	font-weight: 600;
}
.fb-shape-tag {
	font-size: var(--text-xs);
	color: var(--text-muted);
	background: var(--subtle-fg, #eef);
	border-radius: 8px;
	padding: 0 6px;
	margin-left: 4px;
	text-transform: capitalize;
}
.fb-hint {
	color: var(--text-muted);
}
</style>
