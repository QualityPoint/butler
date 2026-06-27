<template>
	<div
		ref="containerRef"
		class="fb-canvas"
		tabindex="0"
		:style="{ cursor: cursorStyle }"
		@mousedown.middle.prevent="startPan"
		@keydown.delete="deleteSelected"
		@keydown.backspace="deleteSelected"
		@keydown.esc="onEsc"
		@keydown.enter.prevent="onEnter"
		@keydown.ctrl.a.prevent="onSelectAll"
		@keydown.meta.a.prevent="onSelectAll"
		@keydown.ctrl.c="onCopy"
		@keydown.meta.c="onCopy"
		@keydown.ctrl.v="onPaste"
		@keydown.meta.v="onPaste"
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
			@mousemove="onStageMouseMove"
			@dblclick="onStageDblClick"
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

			<!-- marquee (rubber-band) selection rectangle -->
			<v-layer :config="{ listening: false }">
				<v-rect v-if="marquee.active" :config="marqueeConfig" />
			</v-layer>

			<!-- blueprint transformer (blueprint layer, not while calibrating) -->
			<v-layer :config="{ listening: isBlueprintLayer }">
				<v-transformer ref="bpTransformerRef" :config="bpTransformerConfig" />
			</v-layer>

			<!-- calibration overlay (dashed line follows the cursor after the first point) -->
			<v-layer v-if="store.calibrating.value" :config="{ listening: false }">
				<v-line v-if="calLinePoints" :config="calLineConfig" />
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

// per-tool cursors (only meaningful once an amenity is picked)
const PEN_CURSOR =
	`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24'%3E%3Cpath fill='%23222' stroke='white' stroke-width='1' d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.58z'/%3E%3C/svg%3E") 2 20, crosshair`;
const POINT_CURSOR =
	`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18'%3E%3Ccircle cx='9' cy='9' r='5' fill='%23222' stroke='white'/%3E%3C/svg%3E") 9 9, crosshair`;
const cursorStyle = computed(() => {
	if (panning.value) return "grabbing"; // middle-button pan, held for the whole drag
	const t = store.active_tool.value;
	if (!isDrawingLayer.value || t === "select" || !store.active_amenity.value) return "default";
	if (t === "pen") return PEN_CURSOR;
	if (t === "point") return POINT_CURSOR;
	return "crosshair";
});

// marquee (rubber-band) selection rectangle, in world coords
const marquee = reactive({ active: false, x1: 0, y1: 0, x2: 0, y2: 0 });
const marqueeConfig = computed(() => ({
	x: Math.min(marquee.x1, marquee.x2),
	y: Math.min(marquee.y1, marquee.y2),
	width: Math.abs(marquee.x2 - marquee.x1),
	height: Math.abs(marquee.y2 - marquee.y1),
	fill: "rgba(36,144,239,0.08)",
	stroke: "#2490ef",
	strokeWidth: 1 / scale.value,
	dash: [4 / scale.value, 4 / scale.value],
}));

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

const transformerConfig = computed(() => {
	const shape = store.selected_room.value?.shape;
	const resizable = shape === "rect" || shape === "ellipse"; // polygon/point: no resize
	return {
		rotateEnabled: shape !== "point",
		rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
		rotationSnapTolerance: 7,
		keepRatio: false,
		enabledAnchors: resizable
			? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]
			: [],
		borderStroke: "#2490ef",
		anchorStroke: "#2490ef",
		anchorSize: 8,
	};
});

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

// `silent` (auto-fit on load) places the blueprint without marking the doc dirty;
// the Toolbar "Fit" button calls it non-silently since that IS a user edit.
function fit_blueprint(silent = false) {
	if (!blueprintImage.value) return;
	const { width: w, height: h } = blueprintImage.value;
	const wW = design.value.canvas.width;
	const wH = design.value.canvas.height;
	const s = Math.min(wW / w, wH / h);
	store.set_blueprint_transform(
		{
			x: (wW - w * s) / 2,
			y: (wH - h * s) / 2,
			scaleX: s,
			scaleY: s,
			rotation: 0,
			opacity: store.active_blueprint.value?.opacity ?? 0.6,
		},
		{ silent }
	);
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
		if (doFit && !store.active_blueprint.value) fit_blueprint(true); // auto-fit: don't mark dirty
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
const calCursor = ref(null); // live cursor position (world coords) after the first point
// line endpoints: 1st point → 2nd point (or the cursor while choosing the 2nd)
const calLinePoints = computed(() => {
	const a = calPoints.value[0];
	if (!a) return null;
	const b = calPoints.value[1] || calCursor.value;
	return b ? [a.x, a.y, b.x, b.y] : null;
});
const calLineConfig = computed(() => ({
	points: calLinePoints.value || [],
	stroke: "#e6a23c",
	strokeWidth: 2 / scale.value,
	dash: [6 / scale.value, 4 / scale.value],
}));
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
	else if (store.pen_room_id.value) store.cancel_pen();
	else store.clear_selection();
}
watch(
	() => store.calibrating.value,
	(on) => {
		if (!on) {
			calPoints.value = [];
			calCursor.value = null;
		}
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
	endShapeDraw(); // and any shape-draw listeners
	endMarquee(); // and any marquee listeners
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
const panning = ref(false); // reactive so the cursor stays "grabbing" for the whole drag
function startPan(e) {
	panStart = { cx: e.clientX, cy: e.clientY, x: stagePos.x, y: stagePos.y };
	panning.value = true;
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
	panning.value = false;
	window.removeEventListener("mousemove", onPanMove);
	window.removeEventListener("mouseup", endPan);
}

// world coords from a browser mouse event (for window-level move listeners)
function worldFromEvent(e) {
	const box = stageRef.value.getStage().container().getBoundingClientRect();
	return {
		x: (e.clientX - box.left - stagePos.x) / scale.value,
		y: (e.clientY - box.top - stagePos.y) / scale.value,
	};
}

// --- draw the active amenity / select existing shapes ---
function onStageMouseDown(e) {
	if (e.evt && e.evt.button === 1) return; // middle button = pan
	containerRef.value?.focus();

	// calibration runs on the blueprint layer too, so handle it before the drawing-layer guard
	if (store.calibrating.value) {
		const p = stageRef.value.getStage().getRelativePointerPosition();
		if (calPoints.value.length >= 2) calPoints.value = [];
		calPoints.value = [...calPoints.value, { x: p.x, y: p.y }];
		if (calPoints.value.length === 2) promptCalibration();
		return;
	}

	if (!isDrawingLayer.value) return;

	const tool = store.active_tool.value;

	// select tool: no drawing. Empty-canvas drag = rubber-band select; a shape click selects it.
	if (tool === "select") {
		if (e.target === e.target.getStage()) {
			const p = stageRef.value.getStage().getRelativePointerPosition();
			marquee.active = true;
			marquee.x1 = marquee.x2 = p.x;
			marquee.y1 = marquee.y2 = p.y;
			window.addEventListener("mousemove", onMarqueeMove);
			window.addEventListener("mouseup", onMarqueeUp);
		}
		return;
	}

	// pen: every click drops a vertex (RoomShape doesn't intercept while pen is active)
	if (tool === "pen") {
		if (!store.active_amenity.value) return;
		const p = stageRef.value.getStage().getRelativePointerPosition();
		store.pen_click(p.x, p.y);
		return;
	}

	// clicking an existing shape is selection (handled in RoomShape) — only draw on empty canvas
	if (e.target !== e.target.getStage()) return;

	if (!store.active_amenity.value) {
		store.clear_selection();
		return;
	}

	const p = stageRef.value.getStage().getRelativePointerPosition();
	if (tool === "point") {
		store.draw_point(p.x, p.y);
		return;
	}
	// rect / ellipse / n-gon: click-drag to size
	store.begin_draw(p.x, p.y);
	window.addEventListener("mousemove", onShapeDrawMove);
	window.addEventListener("mouseup", onShapeDrawUp);
}

// track the cursor so the calibration line rubber-bands after the first point
function onStageMouseMove() {
	if (store.calibrating.value && calPoints.value.length === 1) {
		calCursor.value = stageRef.value.getStage().getRelativePointerPosition();
	}
}

// --- click-drag shape sizing ---
function onShapeDrawMove(e) {
	const p = worldFromEvent(e);
	store.update_draw(p.x, p.y);
}
function endShapeDraw() {
	window.removeEventListener("mousemove", onShapeDrawMove);
	window.removeEventListener("mouseup", onShapeDrawUp);
}
function onShapeDrawUp() {
	endShapeDraw();
	store.finish_draw();
}

// --- marquee (rubber-band) selection ---
function onMarqueeMove(e) {
	const p = worldFromEvent(e);
	marquee.x2 = p.x;
	marquee.y2 = p.y;
}
function endMarquee() {
	window.removeEventListener("mousemove", onMarqueeMove);
	window.removeEventListener("mouseup", onMarqueeUp);
}
function onMarqueeUp() {
	endMarquee();
	marquee.active = false;
	// a tiny box = a plain click → clear; a real drag → select everything inside
	if (Math.abs(marquee.x2 - marquee.x1) < 3 && Math.abs(marquee.y2 - marquee.y1) < 3) {
		store.clear_selection();
	} else {
		store.select_within(marquee.x1, marquee.y1, marquee.x2, marquee.y2);
	}
}

function deleteSelected() {
	if (!isDrawingLayer.value) return;
	for (const id of [...store.selected_ids.value]) store.delete_room(id);
}

function onEnter() {
	if (store.pen_room_id.value) store.finish_pen();
}
// double-click closes a freehand polygon (in addition to clicking the first point / Enter)
function onStageDblClick() {
	if (store.active_tool.value === "pen" && store.pen_room_id.value) store.finish_pen();
}
function onSelectAll() {
	if (isDrawingLayer.value) store.select_all();
}
function onCopy() {
	store.copy_selection();
}
function onPaste() {
	if (isDrawingLayer.value) store.paste();
}

// nudge all selected rooms with the arrow keys
function onNudge(e, ux, uy) {
	const rooms = store.selected_rooms.value;
	if (!isDrawingLayer.value || !rooms.length) return;
	const step = e.shiftKey ? 10 : 1;
	for (const r of rooms) store.update_room(r.id, { x: r.x + ux * step, y: r.y + uy * step });
}

// --- keep the room transformer attached to the selected node ---
watch(
	() => [
		store.selected_ids.value.length,
		store.selected_room.value?.id,
		rooms.value.length,
		store.active_floor_type.value,
		store.selected_room.value?.shape,
		store.active_layer.value,
		store.pen_room_id.value,
	],
	() => {
		nextTick(() => {
			const tr = transformerRef.value?.getNode();
			const layer = roomsLayerRef.value?.getNode();
			if (!tr || !layer) return;
			// attach only to a single selected room (no transformer for multi-select / pen /
			// points — points show a ring + centroid instead)
			const single =
				isDrawingLayer.value && !store.pen_room_id.value ? store.selected_room.value : null;
			const node = single && single.shape !== "point" ? layer.findOne(`#${single.id}`) : null;
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
