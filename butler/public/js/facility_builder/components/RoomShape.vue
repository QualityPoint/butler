<template>
	<v-group :config="groupConfig" @dragend="onDragEnd" @transformend="onTransformEnd">
		<!-- rectangle -->
		<v-rect
			v-if="room.shape !== 'polygon'"
			:config="rectConfig"
			@mousedown="select"
			@tap="select"
		/>
		<!-- polygon -->
		<v-line
			v-else
			:config="lineConfig"
			@mousedown="select"
			@tap="select"
			@dblclick="onAddVertex"
		/>

		<v-text :config="labelConfig" :listening="false" />

		<!-- edge midpoint "add" handles (selected polygon only) — click to insert a node -->
		<template v-if="room.shape === 'polygon' && isSelected">
			<v-circle
				v-for="m in midpointList"
				:key="'mid-' + m.index"
				:config="midpointConfig(m)"
				@mousedown="onInsertMidpoint($event, m.index)"
				@tap="onInsertMidpoint($event, m.index)"
			/>
		</template>

		<!-- corner vertex handles (selected polygon only) — drag to reshape, dbl-click to remove -->
		<template v-if="room.shape === 'polygon' && isSelected">
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
import { inject, computed } from "vue";
import { resolveColor } from "../colors";
import { room_bbox, dist_to_segment } from "../utils";

const props = defineProps(["room"]);
const store = inject("$store");

const isSelected = computed(() => store.selected_id.value === props.room.id);
const fillColor = computed(() =>
	resolveColor(props.room.space_type, store.space_colors.value)
);

const groupConfig = computed(() => ({
	id: props.room.id,
	x: props.room.x,
	y: props.room.y,
	rotation: props.room.rotation || 0,
	opacity: store.rooms_opacity.value,
	draggable: true,
}));

const strokeColor = computed(() => (isSelected.value ? "#2490ef" : "#9aa0ac"));
const strokeWidth = computed(() => (isSelected.value ? 2 : 1));

const rectConfig = computed(() => ({
	width: props.room.w,
	height: props.room.h,
	fill: fillColor.value,
	stroke: strokeColor.value,
	strokeWidth: strokeWidth.value,
}));

const lineConfig = computed(() => ({
	points: props.room.points || [],
	closed: true,
	fill: fillColor.value,
	stroke: strokeColor.value,
	strokeWidth: strokeWidth.value,
}));

const labelConfig = computed(() => {
	const b = room_bbox(props.room);
	return {
		x: b.x,
		y: b.y,
		width: b.w,
		height: b.h,
		text: `${props.room.space_type}\n${props.room.area.toFixed(1)} m²`,
		align: "center",
		verticalAlign: "middle",
		fontSize: 12,
		fill: "#1f272e",
		padding: 4,
	};
});

// --- vertex handles ---
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

// --- edge midpoints (the "+" add handles) ---
const midpointList = computed(() => {
	const pts = props.room.points || [];
	const n = pts.length;
	const out = [];
	for (let i = 0; i < n; i += 2) {
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

// insert a new vertex at the midpoint of edge `edgeIndex` (between vertex i and i+1)
function onInsertMidpoint(e, edgeIndex) {
	e.cancelBubble = true; // don't start a group drag
	const pts = props.room.points.slice();
	const n = pts.length;
	const ax = pts[edgeIndex * 2], ay = pts[edgeIndex * 2 + 1];
	const bx = pts[(edgeIndex * 2 + 2) % n], by = pts[(edgeIndex * 2 + 3) % n];
	const mx = store.snap_coord((ax + bx) / 2);
	const my = store.snap_coord((ay + by) / 2);
	pts.splice(edgeIndex * 2 + 2, 0, mx, my);
	store.update_room(props.room.id, { points: pts });
	store.selected_id.value = props.room.id;
}

function select(e) {
	if (e?.cancelBubble !== undefined) e.cancelBubble = true;
	store.selected_id.value = props.room.id;
}

// --- whole-room move ---
function onDragEnd(e) {
	if (e.target !== e.currentTarget) return; // ignore child (vertex) drags
	const node = e.target;
	const x = store.snap_coord(node.x());
	const y = store.snap_coord(node.y());
	node.position({ x, y });
	store.update_room(props.room.id, { x, y });
}

// --- resize (rect) / rotate (both) ---
function onTransformEnd(e) {
	const node = e.target; // the group
	if (props.room.shape === "polygon") {
		node.scaleX(1);
		node.scaleY(1);
		store.update_room(props.room.id, {
			x: store.snap_coord(node.x()),
			y: store.snap_coord(node.y()),
			rotation: node.rotation(),
		});
		return;
	}
	const minSize = store.snap_enabled.value ? store.design.value.canvas.grid : 1;
	const w = Math.max(minSize, store.snap_coord(props.room.w * node.scaleX()));
	const h = Math.max(minSize, store.snap_coord(props.room.h * node.scaleY()));
	node.scaleX(1);
	node.scaleY(1);
	store.update_room(props.room.id, {
		x: store.snap_coord(node.x()),
		y: store.snap_coord(node.y()),
		w,
		h,
		rotation: node.rotation(),
	});
}

// --- vertex editing ---
function onVertexDrag(e, index) {
	const pts = props.room.points.slice();
	pts[index * 2] = e.target.x();
	pts[index * 2 + 1] = e.target.y();
	store.update_room(props.room.id, { points: pts });
}

function onVertexDragEnd(e, index) {
	const x = store.snap_coord(e.target.x());
	const y = store.snap_coord(e.target.y());
	e.target.position({ x, y });
	const pts = props.room.points.slice();
	pts[index * 2] = x;
	pts[index * 2 + 1] = y;
	store.update_room(props.room.id, { points: pts });
}

function onAddVertex(e) {
	e.cancelBubble = true;
	const group = e.target.getParent();
	const p = group.getRelativePointerPosition();
	const pts = props.room.points;
	// find the nearest edge and insert the click point after its start vertex
	let bestStart = 0;
	let bestDist = Infinity;
	for (let i = 0; i < pts.length; i += 2) {
		const ax = pts[i], ay = pts[i + 1];
		const bx = pts[(i + 2) % pts.length], by = pts[(i + 3) % pts.length];
		const d = dist_to_segment(p.x, p.y, ax, ay, bx, by);
		if (d < bestDist) {
			bestDist = d;
			bestStart = i;
		}
	}
	const np = pts.slice();
	np.splice(bestStart + 2, 0, store.snap_coord(p.x), store.snap_coord(p.y));
	store.update_room(props.room.id, { points: np });
}

function onDeleteVertex(index) {
	const pts = props.room.points;
	if (pts.length / 2 <= 3) return; // keep at least a triangle
	const np = pts.slice();
	np.splice(index * 2, 2);
	store.update_room(props.room.id, { points: np });
}
</script>
