<template>
	<!-- A floating island over the canvas rather than a strip in the toolbar, after
	     Excalidraw's (which Sketchboard wraps): the shape tools are the thing you reach for
	     most while drawing, so they sit next to the drawing instead of at the top of the
	     page. Mirrored to the right edge, where they are out of the way of the sidebar. -->
	<div class="fb-dock" role="toolbar" :aria-label="__('Shape tools')" @keydown.up.prevent="step(-1)" @keydown.down.prevent="step(1)">
		<div class="fb-dock-island">
			<button
				v-for="(t, i) in tools"
				:key="t.key"
				type="button"
				class="fb-dock-tool"
				:class="{ 'fb-dock-tool-on': store.active_tool.value === t.key }"
				:title="toolTitle(t)"
				:aria-label="t.label"
				:aria-pressed="store.active_tool.value === t.key"
				:tabindex="store.active_tool.value === t.key ? 0 : -1"
				:disabled="!usable(t)"
				@click="store.set_active_tool(t.key)"
				v-html="t.svg"
			></button>
		</div>

		<!-- Point styling rides below as a second island, the way Excalidraw floats its
		     properties panel beside the tools: the icon picker is a full Frappe control and
		     will not fit in a 40px column. -->
		<div v-show="pointActive" class="fb-dock-island fb-dock-props">
			<div ref="iconControl" class="fb-dock-icon"></div>
			<div class="fb-dock-row">
				<input
					type="color"
					class="fb-dock-color"
					:value="pointColor"
					:disabled="store.read_only.value"
					:title="__('Colour')"
					@input="setPointColor"
				/>
				<input
					type="number"
					min="8"
					max="96"
					class="fb-dock-size"
					:value="pointSize"
					:disabled="store.read_only.value"
					:title="__('Size (px)')"
					@change="setPointSize"
				/>
			</div>
		</div>
	</div>
</template>

<script setup>
import { inject, computed, ref, watch, nextTick, onBeforeUnmount } from "vue";

const store = inject("$store");
const room = computed(() => store.selected_room.value);

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

// Every tool but Select draws, and drawing is a no-op until an amenity is picked — the
// store's add_room/place_point/start_pen all bail on `!active_amenity`. Offering them
// anyway meant clicking a tool, seeing it highlight, clicking the canvas and getting
// nothing, with only a small "Pick Amenity" hint in the toolbar to explain it.
//
// Select stays live: it is how you reach something already on the plan, which has nothing
// to do with what you are about to draw.
const draws = (t) => t.key !== "select";
function usable(t) {
	if (store.read_only.value) return false;
	return !draws(t) || Boolean(store.active_amenity.value);
}
function toolTitle(t) {
	if (store.read_only.value) return __("Read only");
	if (!usable(t)) return __("Pick an amenity first, then draw with {0}", [t.label]);
	return t.label;
}

// one roving tabstop for the whole island, so Tab passes it in one step and the arrows
// move within it — the same contract the layer switcher in the toolbar offers
function step(delta) {
	// skip what cannot be reached by clicking either, or the arrows would land on a
	// disabled tool and set it
	const reachable = tools.filter(usable);
	if (!reachable.length) return;
	// -1 when the active tool has become unusable (the amenity was cleared under it), and
	// the modulo then lands on the first reachable one, which is what we want
	const at = reachable.findIndex((t) => t.key === store.active_tool.value);
	const next = reachable[(at + delta + reachable.length) % reachable.length];
	store.set_active_tool(next.key);
	nextTick(() => {
		const el = document.querySelector(".fb-dock-tool-on");
		el?.focus();
	});
}

// the point controls edit the selected point if there is one, else the tool's defaults
const pointRoom = computed(() => (room.value?.shape === "point" ? room.value : null));
const pointActive = computed(() => store.active_tool.value === "point" || !!pointRoom.value);
const pointColor = computed(
	() => pointRoom.value?.color || store.point_style.value.color || "#2490ef"
);
const pointSize = computed(() => pointRoom.value?.size || store.point_style.value.size || 24);

function applyPoint(patch) {
	if (pointRoom.value) store.set_point_style(pointRoom.value.id, patch);
	else store.set_point_defaults(patch);
}
function setPointColor(e) {
	applyPoint({ color: e.target.value });
}
function setPointSize(e) {
	applyPoint({ size: Math.max(8, Number(e.target.value) || 24) });
}

// inline Frappe Icon picker — mounted while the Point tool is active
const iconControl = ref(null);
let iconCtrl = null;

const currentIcon = () => pointRoom.value?.icon ?? store.point_style.value.icon ?? null;

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

// The dock only exists on the drawing layer, so there is no layer test left here — the
// parent's v-if is the test.
watch(
	() => pointActive.value && !store.read_only.value,
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
</script>

<style scoped>
.fb-dock {
	position: absolute;
	/* above centre: the lower half of a plan is where most drawing happens, and a dock
	   sitting dead-centre kept landing on it */
	top: 38%;
	right: 12px;
	transform: translateY(-50%);
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 8px;
	z-index: 5;
	/* the canvas pans under it; only the islands themselves take the pointer */
	pointer-events: none;
}
/* Excalidraw's Island, to the value: white/near-black ground, 8px radius, and the same
   three-layer shadow — a hairline, a close blur, and a wide soft drop. */
.fb-dock-island {
	pointer-events: auto;
	background: var(--card-bg, #fff);
	border-radius: 8px;
	padding: 4px;
	box-shadow:
		0 0 0.93px 0 rgba(0, 0, 0, 0.17),
		0 0 3.13px 0 rgba(0, 0, 0, 0.08),
		0 7px 14px 0 rgba(0, 0, 0, 0.05);
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.fb-dock-tool {
	appearance: none;
	border: 0;
	background: transparent;
	color: var(--text-muted);
	width: 32px;
	height: 32px;
	border-radius: 6px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: background 100ms ease, color 100ms ease;
}
.fb-dock-tool:hover:not(:disabled) {
	background: var(--fg-hover-color, var(--gray-100, #f4f5f6));
	color: var(--text-color);
}
.fb-dock-tool:focus-visible {
	outline: 2px solid var(--text-color); /* --primary never inverts; see FloorTabs */
	outline-offset: -2px;
}
/* Grey, not blue. `--bg-gray`/`--text-on-gray` are the pair dark.scss redefines, so this
   inverts; the raw `--gray-*` scale does not (dark.scss only overrides 700 and 800).
   
   In light mode --bg-gray and --fg-hover-color are both --gray-100, so the fill alone
   cannot tell the active tool from a hovered one. The inset ring is what separates them:
   hover is a soft fill, active is a fill with an edge. */
.fb-dock-tool-on,
.fb-dock-tool-on:hover {
	background: var(--bg-gray);
	color: var(--text-on-gray);
	box-shadow: inset 0 0 0 1px var(--border-color);
}
.fb-dock-tool:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
/* A shape tool can be the active one and still be unusable, when the amenity was cleared
   after it was chosen. The choice is deliberately kept rather than reset to Select — it is
   what you will draw with the moment you pick an amenity — so it keeps its ring and just
   dims, reading as "waiting" instead of "broken". */
.fb-dock-tool-on:disabled {
	opacity: 0.55;
}
.fb-dock-props {
	width: 168px;
	padding: 8px;
	gap: 6px;
}
.fb-dock-row {
	display: flex;
	align-items: center;
	gap: 6px;
}
.fb-dock-color {
	width: 32px;
	height: 26px;
	padding: 0;
	border: 1px solid var(--border-color);
	border-radius: var(--border-radius);
	background: none;
	cursor: pointer;
	flex-shrink: 0;
}
.fb-dock-size {
	width: 100%;
	min-width: 0;
	height: 26px;
	border: 1px solid var(--border-color);
	background: var(--control-bg);
	color: var(--text-color);
	border-radius: var(--border-radius);
	padding: 0 6px;
}
/* the Frappe Icon control, stripped of its label line the way the toolbar already does */
.fb-dock-icon :deep(.frappe-control),
.fb-dock-icon :deep(.form-group),
.fb-dock-icon :deep(.control-input-wrapper),
.fb-dock-icon :deep(.control-input) {
	margin: 0 !important;
	padding: 0 !important;
	width: 100%;
}
.fb-dock-icon :deep(.clearfix),
.fb-dock-icon :deep(.control-label),
.fb-dock-icon :deep(.help-box) {
	display: none !important;
}
.fb-dock-icon :deep(.control-input) {
	position: relative;
	height: 26px;
}
.fb-dock-icon :deep(input) {
	height: 26px;
	min-height: 26px;
}
.fb-dock-icon :deep(.selected-icon) {
	top: 50% !important;
	transform: translateY(-50%);
}

/* narrow screens: the island would crowd the drawing, so lay it flat along the bottom */
@media (max-width: 700px) {
	.fb-dock {
		top: auto;
		bottom: 12px;
		right: 12px;
		left: 12px;
		transform: none;
		align-items: center;
	}
	.fb-dock-island {
		flex-direction: row;
		max-width: 100%;
		overflow-x: auto;
	}
	.fb-dock-props {
		flex-direction: row;
		width: auto;
	}
}
</style>
