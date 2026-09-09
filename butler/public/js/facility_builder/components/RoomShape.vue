<template>
	<v-group
		:config="groupConfig"
		@dragstart="onDragStart"
		@dragmove="onDragMove"
		@dragend="onDragEnd"
		@transformend="onTransformEnd"
	>
		<!-- rectangle -->
		<v-rect
			v-if="room.shape === 'rect'"
			:config="rectConfig"
			@mousedown="select"
			@tap="select"
		/>
		<!-- ellipse -->
		<v-ellipse
			v-else-if="room.shape === 'ellipse'"
			:config="ellipseConfig"
			@mousedown="select"
			@tap="select"
		/>
		<!-- point marker: icon image, or a filled circle fallback -->
		<template v-else-if="room.shape === 'point'">
			<!-- selection ring + centroid dot so a selected point is visible/locatable -->
			<v-circle v-if="isSelected" :config="pointSelectRingConfig" :listening="false" />
			<v-image
				v-if="iconImage"
				:config="pointImageConfig"
				@mousedown="select"
				@tap="select"
			/>
			<v-circle v-else :config="pointCircleConfig" @mousedown="select" @tap="select" />
			<v-circle v-if="isSelected" :config="pointCentroidConfig" :listening="false" />
		</template>
		<!-- polygon -->
		<v-line
			v-else
			:config="lineConfig"
			@mousedown="select"
			@tap="select"
			@dblclick="onAddVertex"
		/>

		<v-text :config="labelConfig" :listening="false" />

		<!-- edge midpoint "add" handles (selected polygon/line only; not while drawing it) -->
		<template v-if="isPath && isSelected && !isPenRoom && isDrawingLayer">
			<v-circle
				v-for="m in midpointList"
				:key="'mid-' + m.index"
				:config="midpointConfig(m)"
				@mousedown="onInsertMidpoint($event, m.index)"
				@tap="onInsertMidpoint($event, m.index)"
			/>
		</template>

		<!-- corner vertex handles (selected polygon/line only; not while drawing it) -->
		<template v-if="isPath && isSelected && !isPenRoom && isDrawingLayer">
			<v-circle
				v-for="v in vertexList"
				:key="v.index"
				:config="vertexConfig(v)"
				@dragmove="onVertexDrag($event, v.index)"
				@dragend="onVertexDragEnd($event, v.index)"
				@dblclick="onDeleteVertex(v.index)"
			/>
		</template>
	</v-group>
</template>

<script setup>
import { inject, computed, ref, watchEffect } from "vue";
import { resolveColor } from "../colors";
import { room_bbox, room_length_m, dist_to_segment } from "../utils";
import { load_icon_image } from "../icons";

const props = defineProps(["room"]);
const store = inject("$store");

const isSelected = computed(() => store.is_selected(props.room.id));
// Features is a select-only layer: a room can be picked so its contents can be edited,
// but not moved, resized, rotated or reshaped. Everything geometric hangs off this.
const isDrawingLayer = computed(() => store.active_layer.value === "drawing");
const isPenRoom = computed(() => store.pen_room_id.value === props.room.id); // being drawn
// point-list shapes that carry editable vertex/midpoint handles (closed polygon or open line)
const isPath = computed(() => props.room.shape === "polygon" || props.room.shape === "line");
const isLine = computed(() => props.room.shape === "line");
const fillColor = computed(() =>
	resolveColor(props.room.category, store.category_colors.value)
);
// points may carry their own colour; otherwise fall back to the category colour
const pointColor = computed(() => props.room.color || fillColor.value);

const groupConfig = computed(() => ({
	id: props.room.id,
	x: props.room.x,
	y: props.room.y,
	rotation: props.room.rotation || 0,
	opacity: store.rooms_opacity.value,
	draggable:
		isDrawingLayer.value &&
		!store.read_only.value &&
		store.active_tool.value !== "pen" &&
		store.pen_room_id.value !== props.room.id,
}));

const strokeColor = computed(() => {
	if (isSelected.value) return "#2490ef";
	// on the Features layer, a placement whose contents differ from its Amenity's
	// standard composition is worth spotting without clicking every room
	if (store.active_layer.value === "features" && store.has_custom_features(props.room)) {
		return "#e6a23c";
	}
	return "#9aa0ac";
});
const strokeWidth = computed(() =>
	isSelected.value ||
	(store.active_layer.value === "features" && store.has_custom_features(props.room))
		? 2
		: 1
);

const rectConfig = computed(() => ({
	width: props.room.w,
	height: props.room.h,
	fill: fillColor.value,
	stroke: strokeColor.value,
	strokeWidth: strokeWidth.value,
}));

const ellipseConfig = computed(() => ({
	x: props.room.rx,
	y: props.room.ry,
	radiusX: props.room.rx,
	radiusY: props.room.ry,
	fill: fillColor.value,
	stroke: strokeColor.value,
	strokeWidth: strokeWidth.value,
}));

// shared by the closed polygon and the open line (the v-else branch)
const lineConfig = computed(() => ({
	points: props.room.points || [],
	closed: !isLine.value, // polygon closes the path; a line stays open
	// an open line has no fill; it's drawn as a thicker, category-coloured stroke
	fill: isLine.value ? undefined : fillColor.value,
	stroke: isLine.value ? (isSelected.value ? "#2490ef" : fillColor.value) : strokeColor.value,
	strokeWidth: isLine.value ? (isSelected.value ? 4 : 3) : strokeWidth.value,
	hitStrokeWidth: isLine.value ? 12 : undefined, // easier to click a thin line
	lineCap: "round",
	lineJoin: "round",
}));

// --- point marker ---
const iconImage = ref(null);
watchEffect(async () => {
	if (props.room.shape !== "point" || !props.room.icon) {
		iconImage.value = null;
		return;
	}
	// solid, not outlined: a marker's colour is the marker's, and it has to read at 24px
	iconImage.value = await load_icon_image(props.room.icon, { color: pointColor.value });
});

const pointImageConfig = computed(() => {
	const s = props.room.size || 24;
	return { image: iconImage.value, x: -s / 2, y: -s / 2, width: s, height: s };
});
const pointCircleConfig = computed(() => {
	const s = props.room.size || 24;
	return {
		x: 0,
		y: 0,
		radius: s / 2,
		fill: pointColor.value,
		stroke: strokeColor.value,
		strokeWidth: strokeWidth.value,
	};
});
// when a point is selected: a dashed ring around it + a centroid dot at its location
const pointSelectRingConfig = computed(() => {
	const s = props.room.size || 24;
	return {
		x: 0,
		y: 0,
		radius: s / 2 + 5,
		stroke: "#2490ef",
		strokeWidth: 1.5,
		dash: [4, 3],
		fillEnabled: false,
	};
});
const pointCentroidConfig = { x: 0, y: 0, radius: 2.5, fill: "#2490ef" };

const labelConfig = computed(() => {
	if (props.room.shape === "point") {
		const s = props.room.size || 24;
		return {
			x: -40,
			y: s / 2 + 2,
			width: 80,
			text: __(props.room.amenity),
			align: "center",
			fontSize: 12,
			fill: "#1f272e",
		};
	}
	if (props.room.shape === "line") {
		// a line shows its length (not area), centred above the segment
		const lb = room_bbox(props.room);
		const len = room_length_m(props.room, store.ppm.value);
		return {
			x: lb.x + lb.w / 2 - 40,
			y: lb.y - 18,
			width: 80,
			text: `${__(props.room.amenity)} · ${len.toFixed(1)} m`,
			align: "center",
			fontSize: 12,
			fill: "#1f272e",
		};
	}
	const b = room_bbox(props.room);
	return {
		x: b.x,
		y: b.y,
		width: b.w,
		height: b.h,
		text: `${__(props.room.amenity)}\n${props.room.area.toFixed(1)} m²`,
		align: "center",
		verticalAlign: "middle",
		fontSize: 12,
		fill: "#1f272e",
		padding: 4,
	};
});

// --- vertex handles (polygons) ---
const vertexList = computed(() => {
	const pts = props.room.points || [];
	const out = [];
	for (let i = 0; i < pts.length; i += 2) {
		out.push({ index: i / 2, x: pts[i], y: pts[i + 1] });
	}
	return out;
});

function vertexConfig(v) {
	return {
		x: v.x,
		y: v.y,
		radius: 5,
		fill: "#fff",
		stroke: "#2490ef",
		strokeWidth: 2,
		draggable: true,
		hitStrokeWidth: 12,
	};
}

const midpointList = computed(() => {
	const pts = props.room.points || [];
	const n = pts.length;
	// an open line has no closing edge → stop one vertex short
	const limit = isLine.value ? n - 2 : n;
	const out = [];
	for (let i = 0; i < limit; i += 2) {
		const ax = pts[i], ay = pts[i + 1];
		const bx = pts[(i + 2) % n], by = pts[(i + 3) % n];
		out.push({ index: i / 2, x: (ax + bx) / 2, y: (ay + by) / 2 });
	}
	return out;
});

function midpointConfig(m) {
	return {
		x: m.x,
		y: m.y,
		radius: 4,
		fill: "#2490ef",
		stroke: "#fff",
		strokeWidth: 1.5,
		opacity: 0.55,
		hitStrokeWidth: 12,
	};
}

function onInsertMidpoint(e, edgeIndex) {
	e.cancelBubble = true;
	const pts = props.room.points.slice();
	const n = pts.length;
	const ax = pts[edgeIndex * 2], ay = pts[edgeIndex * 2 + 1];
	const bx = pts[(edgeIndex * 2 + 2) % n], by = pts[(edgeIndex * 2 + 3) % n];
	pts.splice(edgeIndex * 2 + 2, 0, (ax + bx) / 2, (ay + by) / 2);
	store.update_room(props.room.id, { points: pts });
	store.select_only(props.room.id);
}

function select(e) {
	if (store.active_tool.value === "pen") return; // pen clicks belong to the canvas
	if (e?.cancelBubble !== undefined) e.cancelBubble = true;
	const id = props.room.id;
	if (e?.evt?.shiftKey) {
		store.toggle_select(id);
	} else if (!store.is_selected(id)) {
		store.select_only(id); // keep an existing multi-selection so it can be dragged as a group
	}
}

// --- whole-room move (group-aware) ---
let dragGroup = null; // [{ id, x, y }] start positions of everything moving with this room
function group_ids() {
	return store.is_selected(props.room.id) && store.selected_ids.value.length > 1
		? [...store.selected_ids.value]
		: [props.room.id];
}
function onDragStart(e) {
	if (e.target !== e.currentTarget) return;
	const all = store.active_floor.value?.rooms || [];
	dragGroup = group_ids().map((id) => {
		const r = all.find((x) => x.id === id);
		return r ? { id, x: r.x, y: r.y } : null;
	}).filter(Boolean);
}
function onDragMove(e) {
	if (e.target !== e.currentTarget || !dragGroup) return;
	const dx = e.target.x() - props.room.x;
	const dy = e.target.y() - props.room.y;
	for (const g of dragGroup) {
		if (g.id === props.room.id) continue; // moved by Konva itself
		store.update_room(g.id, { x: g.x + dx, y: g.y + dy });
	}
}
function onDragEnd(e) {
	if (e.target !== e.currentTarget) return; // ignore child (vertex) drags
	const node = e.target;
	const snapped = store.snap_room_position(props.room.id, node.x(), node.y()); // object snap
	node.position(snapped);
	const start = (dragGroup || []).find((g) => g.id === props.room.id) || { x: props.room.x, y: props.room.y };
	const dx = snapped.x - start.x;
	const dy = snapped.y - start.y;
	for (const g of dragGroup || [{ id: props.room.id, x: props.room.x, y: props.room.y }]) {
		store.update_room(g.id, { x: g.x + dx, y: g.y + dy });
	}
	dragGroup = null;
}

// --- resize (rect/ellipse) / rotate (all) ---
function onTransformEnd(e) {
	const node = e.target; // the group
	const sx = node.scaleX();
	const sy = node.scaleY();
	node.scaleX(1);
	node.scaleY(1);
	const patch = { x: node.x(), y: node.y(), rotation: node.rotation() };
	if (props.room.shape === "ellipse") {
		patch.rx = Math.max(2, props.room.rx * sx);
		patch.ry = Math.max(2, props.room.ry * sy);
	} else if (props.room.shape === "rect") {
		patch.w = Math.max(1, props.room.w * sx);
		patch.h = Math.max(1, props.room.h * sy);
	}
	// polygon + point: move/rotate only (no size change)
	store.update_room(props.room.id, patch);
}

// --- vertex editing ---
function onVertexDrag(e, index) {
	const pts = props.room.points.slice();
	pts[index * 2] = e.target.x();
	pts[index * 2 + 1] = e.target.y();
	store.update_room(props.room.id, { points: pts });
}

function onVertexDragEnd(e, index) {
	const pts = props.room.points.slice();
	pts[index * 2] = e.target.x();
	pts[index * 2 + 1] = e.target.y();
	store.update_room(props.room.id, { points: pts });
}

function onAddVertex(e) {
	e.cancelBubble = true;
	// while drawing freehand, a double-click closes the polygon instead of adding a vertex
	if (store.active_tool.value === "pen") {
		store.finish_pen();
		return;
	}
	const group = e.target.getParent();
	const p = group.getRelativePointerPosition();
	const pts = props.room.points;
	// an open line has no closing edge → don't consider the wrap-around segment
	const limit = isLine.value ? pts.length - 2 : pts.length;
	let bestStart = 0;
	let bestDist = Infinity;
	for (let i = 0; i < limit; i += 2) {
		const ax = pts[i], ay = pts[i + 1];
		const bx = pts[(i + 2) % pts.length], by = pts[(i + 3) % pts.length];
		const d = dist_to_segment(p.x, p.y, ax, ay, bx, by);
		if (d < bestDist) {
			bestDist = d;
			bestStart = i;
		}
	}
	const np = pts.slice();
	np.splice(bestStart + 2, 0, p.x, p.y);
	store.update_room(props.room.id, { points: np });
}

function onDeleteVertex(index) {
	const pts = props.room.points;
	const min = isLine.value ? 2 : 3; // a line needs ≥2 points, a polygon ≥3
	if (pts.length / 2 <= min) return;
	const np = pts.slice();
	np.splice(index * 2, 2);
	store.update_room(props.room.id, { points: np });
}
</script>
