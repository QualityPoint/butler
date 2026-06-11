<template>
	<div
		ref="containerRef"
		class="fb-canvas"
		tabindex="0"
		@drop="onDrop"
		@dragover.prevent
		@mousedown.middle.prevent="startPan"
		@keydown.delete="deleteSelected"
		@keydown.backspace="deleteSelected"
		@keydown.esc="onEsc"
		@keydown.up.prevent="onNudge($event, 0, -1)"
		@keydown.down.prevent="onNudge($event, 0, 1)"
		@keydown.left.prevent="onNudge($event, -1, 0)"
		@keydown.right.prevent="onNudge($event, 1, 0)"
	>
		<v-stage
			ref="stageRef"
			:config="stageConfig"
			@wheel="onWheel"
			@mousedown="onStageMouseDown"
		>
			<!-- white "paper" world bounds + background grid -->
			<v-layer :config="{ listening: false }">
				<v-rect :config="paperConfig" />
				<v-line
					v-for="line in gridLines"
					:key="line.key"
					:config="{ points: line.points, stroke: '#e2e4e9', strokeWidth: 1 }"
				/>
			</v-layer>

			<!-- blueprint background (traceable); interactive only on the Blueprint layer -->
			<v-layer ref="blueprintLayerRef" :config="{ listening: isBlueprintLayer }">
				<v-image v-if="blueprintImage" :config="blueprintConfig" @dragend="onBlueprintChange" @transformend="onBlueprintChange" />
			</v-layer>

			<!-- rooms; interactive only on the Drawing layer -->
			<v-layer ref="roomsLayerRef" :config="{ listening: isDrawingLayer }">
				<RoomShape v-for="room in rooms" :key="room.id" :room="room" />
			</v-layer>

			<!-- room transformer (drawing layer) -->
			<v-layer :config="{ listening: isDrawingLayer }">
				<v-transformer ref="transformerRef" :config="transformerConfig" />
			</v-layer>

			<!-- blueprint transformer (blueprint layer, not while calibrating) -->
			<v-layer :config="{ listening: isBlueprintLayer }">
				<v-transformer ref="bpTransformerRef" :config="bpTransformerConfig" />
			</v-layer>

			<!-- calibration overlay -->
			<v-layer v-if="store.calibrating.value" :config="{ listening: false }">
				<v-line v-if="calPoints.length === 2" :config="calLineConfig" />
				<v-circle v-for="(p, i) in calPoints" :key="i" :config="calPointConfig(p)" />
			</v-layer>
		</v-stage>
	</div>
</template>

<script setup>
import { inject, computed, ref, reactive, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import RoomShape from "./RoomShape.vue";
import { load_blueprint } from "../blueprint";

const store = inject("$store");
const design = computed(() => store.design.value);

const containerRef = ref(null);
const stageRef = ref(null);
const roomsLayerRef = ref(null);
const transformerRef = ref(null);
const blueprintLayerRef = ref(null);
const bpTransformerRef = ref(null);
const blueprintImage = ref(null); // { image, width, height, pageCount }
const calPoints = ref([]); // calibration points (world coords)

// fixed viewport (fills the container) + view transform (zoom/pan)
const viewport = reactive({ w: 800, h: 600 });
const scale = ref(1);
const stagePos = reactive({ x: 0, y: 0 });

const isBlueprintLayer = computed(() => store.active_layer.value === "blueprint");
const isDrawingLayer = computed(() => store.active_layer.value === "drawing");

const rooms = computed(() => store.active_floor.value?.rooms || []);

const stageConfig = computed(() => ({
	width: viewport.w,
	height: viewport.h,
	scaleX: scale.value,
	scaleY: scale.value,
	x: stagePos.x,
	y: stagePos.y,
	draggable: false, // panning is done with the middle mouse button (see startPan)
}));

const paperConfig = computed(() => ({
	x: 0,
	y: 0,
	width: design.value.canvas.width,
	height: design.value.canvas.height,
	fill: "#ffffff",
	stroke: "#d0d4dc",
	strokeWidth: 1,
}));

const transformerConfig = computed(() => ({
	rotateEnabled: true,
	rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
	rotationSnapTolerance: 7,
	keepRatio: false,
	enabledAnchors:
		store.selected_room.value?.shape === "polygon"
			? []
			: ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"],
	borderStroke: "#2490ef",
	anchorStroke: "#2490ef",
	anchorSize: 8,
}));

// --- blueprint background ---
const blueprintConfig = computed(() => {
	const t = store.active_blueprint.value || {};
	return {
		id: "blueprint",
		image: blueprintImage.value?.image,
		x: t.x ?? 0,
		y: t.y ?? 0,
		scaleX: t.scaleX ?? 1,
		scaleY: t.scaleY ?? 1,
		rotation: t.rotation ?? 0,
		opacity: t.opacity ?? 0.6,
		draggable: isBlueprintLayer.value && !store.calibrating.value,
	};
});

const bpTransformerConfig = {
	rotateEnabled: true,
	rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
	rotationSnapTolerance: 7,
	keepRatio: false,
	borderStroke: "#e6a23c",
	anchorStroke: "#e6a23c",
	anchorSize: 8,
};

function onBlueprintChange(e) {
	const n = e.target;
	store.set_blueprint_transform({
		x: n.x(),
		y: n.y(),
		scaleX: n.scaleX(),
		scaleY: n.scaleY(),
		rotation: n.rotation(),
	});
}

function fit_blueprint() {
	if (!blueprintImage.value) return;
	const { width: w, height: h } = blueprintImage.value;
	const wW = design.value.canvas.width;
	const wH = design.value.canvas.height;
	const s = Math.min(wW / w, wH / h);
	store.set_blueprint_transform({
		x: (wW - w * s) / 2,
		y: (wH - h * s) / 2,
		scaleX: s,
		scaleY: s,
		rotation: 0,
		opacity: store.active_blueprint.value?.opacity ?? 0.6,
	});
}

let loadedPage = 1;
async function loadBlueprint(doFit) {
	const url = store.active_blueprint_url.value;
	blueprintImage.value = null;
	if (!url) {
		store.blueprint_page_count.value = 1;
		return;
	}
	const page = store.active_blueprint_page.value;
	try {
		const res = await load_blueprint(url, { page });
		blueprintImage.value = res;
		loadedPage = page;
		store.blueprint_page_count.value = res.pageCount || 1;
		if (doFit && !store.active_blueprint.value) fit_blueprint();
	} catch (err) {
		frappe.show_alert({ message: err.message, indicator: "orange" });
	}
}

// reload on a new file (re-fit), or on a page change (keep placement)
watch(() => store.active_blueprint_url.value, () => loadBlueprint(true), { immediate: true });
watch(
	() => store.active_blueprint_page.value,
	(p) => {
		if (p && p !== loadedPage && store.active_blueprint_url.value) loadBlueprint(false);
	}
);

// Toolbar "Fit" button
watch(
	() => store.blueprint_fit_nonce.value,
	() => fit_blueprint()
);

// attach the blueprint transformer on the blueprint layer (not while calibrating)
watch(
	() => [store.active_layer.value, !!blueprintImage.value, store.calibrating.value],
	() => {
		nextTick(() => {
			const tr = bpTransformerRef.value?.getNode();
			const layer = blueprintLayerRef.value?.getNode();
			if (!tr || !layer) return;
			const attach = isBlueprintLayer.value && blueprintImage.value && !store.calibrating.value;
			tr.nodes(attach ? [layer.findOne("#blueprint")].filter(Boolean) : []);
			tr.getLayer().batchDraw();
		});
	},
	{ immediate: true }
);

// --- calibration ---
const calLineConfig = computed(() => {
	const [a, b] = calPoints.value;
	return {
		points: [a.x, a.y, b.x, b.y],
		stroke: "#e6a23c",
		strokeWidth: 2 / scale.value,
		dash: [6 / scale.value, 4 / scale.value],
	};
});
function calPointConfig(p) {
	return { x: p.x, y: p.y, radius: 4 / scale.value, fill: "#e6a23c" };
}
function promptCalibration() {
	const [a, b] = calPoints.value;
	const px = Math.hypot(b.x - a.x, b.y - a.y);
	frappe.prompt(
		{ fieldname: "meters", label: __("Real length (meters)"), fieldtype: "Float", reqd: 1 },
		({ meters }) => {
			if (meters > 0 && px > 0) store.set_scale(px / meters);
			calPoints.value = [];
			store.cancel_calibration();
		},
		__("Calibrate Scale"),
		__("Apply")
	);
}
function onEsc() {
	if (store.calibrating.value) store.cancel_calibration();
}
watch(
	() => store.calibrating.value,
	(on) => {
		if (!on) calPoints.value = [];
	}
);

// --- background grid lines (world coords) ---
const gridLines = computed(() => {
	const { width, height, grid } = design.value.canvas;
	const lines = [];
	for (let x = 0; x <= width; x += grid) {
		lines.push({ key: `v${x}`, points: [x, 0, x, height] });
	}
	for (let y = 0; y <= height; y += grid) {
		lines.push({ key: `h${y}`, points: [0, y, width, y] });
	}
	return lines;
});

// --- sizing: fill the container, fit the world once it has a real size ---
let ro = null;
let fitted = false;
onMounted(() => {
	ro = new ResizeObserver(() => {
		measure();
		if (!fitted && viewport.w && viewport.h) {
			fit_to_viewport();
			fitted = true;
		}
	});
	ro.observe(containerRef.value);
});
onBeforeUnmount(() => {
	ro?.disconnect();
	endPan(); // drop any lingering pan listeners
});

function measure() {
	const el = containerRef.value;
	if (!el) return;
	viewport.w = el.clientWidth || viewport.w;
	viewport.h = el.clientHeight || viewport.h;
}

function fit_to_viewport() {
	const wW = design.value.canvas.width;
	const wH = design.value.canvas.height;
	const s = Math.min(viewport.w / wW, viewport.h / wH) * 0.95;
	scale.value = s || 1;
	stagePos.x = (viewport.w - wW * scale.value) / 2;
	stagePos.y = (viewport.h - wH * scale.value) / 2;
}

// --- zoom controls (buttons) ---
function zoomAt(cx, cy, factor) {
	const oldScale = scale.value;
	const wp = { x: (cx - stagePos.x) / oldScale, y: (cy - stagePos.y) / oldScale };
	const ns = Math.max(0.2, Math.min(6, oldScale * factor));
	scale.value = ns;
	stagePos.x = cx - wp.x * ns;
	stagePos.y = cy - wp.y * ns;
}
function zoomIn() {
	zoomAt(viewport.w / 2, viewport.h / 2, 1.2);
}
function zoomOut() {
	zoomAt(viewport.w / 2, viewport.h / 2, 1 / 1.2);
}
function resetZoom() {
	zoomAt(viewport.w / 2, viewport.h / 2, 1 / scale.value); // → 100%, keep centre
}
// centre the whole canvas at full extent — same as when the builder opens
function zoomFit() {
	fit_to_viewport();
}

// expose the zoom controls + scale to the footer (via the store)
watch(scale, (v) => (store.view_scale.value = v), { immediate: true });
onMounted(() => {
	store.zoom_api.value = { in: zoomIn, out: zoomOut, reset: resetZoom, fit: zoomFit };
});
onBeforeUnmount(() => (store.zoom_api.value = null));

// --- zoom: mouse wheel, centred on the cursor ---
function onWheel(e) {
	e.evt.preventDefault();
	const stage = stageRef.value.getStage();
	const pointer = stage.getPointerPosition();
	if (!pointer) return;
	const oldScale = scale.value;
	const worldPoint = {
		x: (pointer.x - stagePos.x) / oldScale,
		y: (pointer.y - stagePos.y) / oldScale,
	};
	let newScale = e.evt.deltaY < 0 ? oldScale * 1.08 : oldScale / 1.08;
	newScale = Math.max(0.2, Math.min(6, newScale));
	scale.value = newScale;
	stagePos.x = pointer.x - worldPoint.x * newScale;
	stagePos.y = pointer.y - worldPoint.y * newScale;
}

// --- pan with the MIDDLE mouse button (left stays for moving objects) ---
let panStart = null;
function startPan(e) {
	panStart = { cx: e.clientX, cy: e.clientY, x: stagePos.x, y: stagePos.y };
	if (containerRef.value) containerRef.value.style.cursor = "grabbing";
	window.addEventListener("mousemove", onPanMove);
	window.addEventListener("mouseup", endPan);
}
function onPanMove(e) {
	if (!panStart) return;
	stagePos.x = panStart.x + (e.clientX - panStart.cx);
	stagePos.y = panStart.y + (e.clientY - panStart.cy);
}
function endPan() {
	panStart = null;
	if (containerRef.value) containerRef.value.style.cursor = "";
	window.removeEventListener("mousemove", onPanMove);
	window.removeEventListener("mouseup", endPan);
}

// --- drop a space type (convert screen coords → world coords) ---
function onDrop(e) {
	e.preventDefault();
	if (!isDrawingLayer.value) return;
	const space_type = e.dataTransfer.getData("text/space-type");
	if (!space_type) return;
	const stage = stageRef.value.getStage();
	const box = stage.container().getBoundingClientRect();
	const worldX = (e.clientX - box.left - stagePos.x) / scale.value;
	const worldY = (e.clientY - box.top - stagePos.y) / scale.value;
	store.add_room({ space_type, x: store.snap_coord(worldX), y: store.snap_coord(worldY) });
}

// --- selection / calibration clicks ---
function onStageMouseDown(e) {
	if (e.evt && e.evt.button === 1) return; // middle button = pan, handled separately
	containerRef.value?.focus(); // so arrow/delete keys target the canvas
	if (store.calibrating.value) {
		const p = stageRef.value.getStage().getRelativePointerPosition();
		if (calPoints.value.length >= 2) calPoints.value = [];
		calPoints.value = [...calPoints.value, { x: p.x, y: p.y }];
		if (calPoints.value.length === 2) promptCalibration();
		return;
	}
	if (isDrawingLayer.value && e.target === e.target.getStage()) {
		store.selected_id.value = null;
	}
}

function deleteSelected() {
	if (isDrawingLayer.value && store.selected_id.value) store.delete_room(store.selected_id.value);
}

// nudge the selected room with the arrow keys
function onNudge(e, ux, uy) {
	const room = store.selected_room.value;
	if (!isDrawingLayer.value || !room) return;
	const step = store.snap_enabled.value
		? store.design.value.canvas.grid
		: e.shiftKey
			? 10
			: 1;
	store.update_room(room.id, { x: room.x + ux * step, y: room.y + uy * step });
}

// --- keep the room transformer attached to the selected node ---
watch(
	() => [
		store.selected_id.value,
		rooms.value.length,
		store.active_floor_type.value,
		store.selected_room.value?.shape,
		store.active_layer.value,
	],
	() => {
		nextTick(() => {
			const tr = transformerRef.value?.getNode();
			const layer = roomsLayerRef.value?.getNode();
			if (!tr || !layer) return;
			const id = isDrawingLayer.value ? store.selected_id.value : null;
			const node = id ? layer.findOne(`#${id}`) : null;
			tr.nodes(node ? [node] : []);
			tr.getLayer().batchDraw();
		});
	},
	{ immediate: true }
);
</script>

<style scoped>
.fb-canvas {
	position: absolute;
	inset: 0;
	background: var(--subtle-fg, #f4f5f6);
	outline: none;
	overflow: hidden;
}
</style>
