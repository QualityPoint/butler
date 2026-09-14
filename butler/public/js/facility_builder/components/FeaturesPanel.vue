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

			<!-- ANNEXES — take the space that is left, and scroll when there is more. The
			     picker sits above the scroller rather than after the list, so its dropdown
			     is never clipped by it. -->
			<div class="fb-features-annexes">
				<div class="fb-features-label">
					<span>
						<span class="fb-section-icon" v-html="ICONS.annexes"></span>
						{{ __("Annexes") }} <span class="fb-count">{{ annexes.length }}</span></span>
					<button
						class="btn btn-xs btn-default fb-reset"
						:disabled="!customised || store.read_only.value"
						:title="__('Go back to the Amenity\'s standard composition')"
						@click="store.reset_room_features(room.id)"
					>
						{{ __("Reset") }}
					</button>
				</div>

				<div v-if="addable.length" class="fb-add-annex">
					<div ref="addControl"></div>
				</div>
				<div v-else-if="annexes.length" class="fb-features-none">
					{{ __("Every annex this Amenity offers is already fitted.") }}
				</div>

				<!-- Two lines, so the name gets the full width and the controls get theirs.
				     One line only fits by squeezing the name to nothing at the sidebar's
				     240px, and widening the sidebar for this layer alone would shift the
				     canvas every time you switch to it. -->
				<div class="fb-annex-list">
					<div v-for="a in annexes" :key="a.annex" class="fb-annex">
						<div class="fb-annex-top">
							<span class="fb-annex-icon" v-html="iconFor(a)"></span>
							<span class="fb-annex-name" :title="a.annex_name">{{ __(a.annex_name) }}</span>
						</div>
						<div class="fb-annex-controls">
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
								class="fb-input fb-annex-uom"
								:value="a.uom || ''"
								:disabled="store.read_only.value"
								:title="__('UOM')"
								@change="store.set_room_annex(room.id, a.annex, { uom: $event.target.value || null })"
							>
								<!-- a select with no matching option shows its first one, which
								     would claim a uom the room does not hold; the server picks
								     the Annex Price's uom (or the Item's) for a blank one -->
								<option v-if="!a.uom" value="">{{ __("Default") }}</option>
								<option v-for="u in a.uoms" :key="u" :value="u">{{ u }}</option>
							</select>
							<button
								class="btn btn-xs fb-annex-remove"
								:disabled="store.read_only.value || annexes.length === 1"
								:title="annexes.length === 1
									? __('An amenity needs at least one annex. Remove the amenity itself instead.')
									: __('Remove')"
								@click="store.remove_room_annex(room.id, a.annex)"
								v-html="removeIcon"
							></button>
						</div>
					</div>
				</div>
			</div>

			<!-- Anchored to the bottom: the light system, and the sound system under it.
			     They are one choice each and always visible, however long the annex list. -->
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
				</div>

				<div v-if="hasSound" class="fb-features-section fb-features-divided">
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
import { resolveColor } from "../colors";

const store = inject("$store");

const room = computed(() => (store.active_layer.value === "features" ? store.selected_room.value : null));
const options = computed(() => (room.value ? store.options_for(room.value.amenity) : {}));
const master = computed(() => (room.value ? store.annexes_for(room.value.amenity) : []));
const customised = computed(() => (room.value ? store.has_custom_features(room.value) : false));

// A room stores only which annex and how much of it; the display name, icon and the UOMs
// it can be measured in all come from the master list. A uom the master no longer offers
// is kept in the options anyway, so an older room never has its unit silently changed by
// merely being looked at.
const annexes = computed(() => {
	if (!room.value) return [];
	const named = {};
	for (const a of master.value) named[a.annex] = a;
	return store.effective_annexes(room.value).map((a) => {
		const source = named[a.annex] || {};
		const uoms = source.uoms || [];
		return {
			...a,
			annex_name: source.annex_name || a.annex,
			icon: source.icon,
			uoms: a.uom && !uoms.includes(a.uom) ? [a.uom, ...uoms] : uoms,
		};
	});
});

// Only what this Amenity offers, minus what is already fitted. The server refuses an
// annex outside `Amenity.annexes` (validate_row_types) and it would have no Annex Price
// anyway, so offering the whole catalogue would only invite a save-time throw.
const addable = computed(() => {
	const fitted = new Set(annexes.value.map((a) => a.annex));
	return master.value.filter((a) => !fitted.has(a.annex));
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
const hasSound = computed(() => flt(options.value.sound_system_price) > 0);
const swatch = computed(() =>
	room.value ? resolveColor(room.value.category, store.category_colors.value) : "transparent"
);

// One fixed icon per section, built once at module scope: they never change, so there is
// nothing to recompute and nothing worth a computed. Rendered through frappe.utils.icon so
// they inherit `--icon-stroke` and follow the theme like every other icon in the desk.
const ICONS = {
	annexes: frappe.utils.icon("package", "sm"),
	light: frappe.utils.icon("lightbulb", "sm"),
	sound: frappe.utils.icon("volume-2", "sm"),
};

// An icon rather than a `×` character: a glyph is centred on its font's baseline and
// x-height, so it always sits a little off-centre in a square button, however the box is
// aligned. A fixed-size SVG has no such metrics and lands dead centre.
const removeIcon = frappe.utils.icon("x", "xs");

// the same icon the canvas draws, so the panel and the plan agree; a lettered chip when
// the Annex has none, matching RoomAnnexes' fallback
function iconFor(annex) {
	if (annex.icon) return frappe.utils.icon(annex.icon, "sm");
	const initial = (annex.annex_name || annex.annex || "?").trim().charAt(0).toUpperCase();
	return `<span class="fb-annex-initial">${frappe.utils.escape_html(initial)}</span>`;
}

// A quantity of zero (or less) is not a quantity — the server refuses it too
// (validate_row_types), and it would otherwise only surface as a save-time throw naming a
// row number nobody can map back to a room.
//
// Refusing is not enough on its own: the input is bound to the model, so if we simply
// ignore the edit the model never changes, Vue never re-renders, and the box goes on
// displaying a 0 that was never stored. Put the real value back, and say how to actually
// get rid of the annex.
function setQty(annex, event) {
	const qty = flt(event.target.value);
	if (qty > 0) {
		store.set_room_annex(room.value.id, annex.annex, { qty });
		return;
	}
	event.target.value = annex.qty;
	frappe.show_alert({
		message: __("A quantity has to be more than zero. Use \u00d7 to remove {0}.",
			[__(annex.annex_name)]),
		indicator: "orange",
	});
}

// --- mounted Frappe controls -----------------------------------------------------------
// The lifecycle rule from Toolbar.vue's icon picker: build once, sync programmatically
// behind a guard so the sync is never mistaken for a user edit, and remove the wrapper
// on teardown. Only the two pickers outside the annex scroller are Frappe controls; the
// per-annex UOM is a plain select, since a dropdown inside a scroller gets clipped by it.
const addControl = ref(null);
let addCtrl = null;
const lightControl = ref(null);
let lightCtrl = null;

function ensureAddControl() {
	if (addCtrl || !addControl.value) return;
	addCtrl = frappe.ui.form.make_control({
		parent: addControl.value,
		df: {
			fieldtype: "Link",
			fieldname: "add_annex",
			options: "Annex",
			placeholder: __("Add annex…"),
			get_query: () => ({
				filters: { name: ["in", addable.value.map((a) => a.annex)] },
			}),
			onchange: () => {
				const annex = addCtrl.get_value();
				if (!annex) return;
				store.add_room_annex(room.value.id, annex);
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
				const picked = lightCtrl.get_value() || null;
				if (picked === (room.value?.light_system || null)) return; // programmatic sync
				store.set_room_features(room.value.id, { light_system: picked });
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

function destroyControls() {
	lightCtrl?.$wrapper?.remove();
	lightCtrl = null;
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
		});
	},
	{ immediate: true }
);

// The annex adder sits behind a v-if, so its host div can come and go while the panel
// stays mounted — every annex fitted hides it. Drop the control when its div goes, or the
// rebuilt div would stay empty behind `if (ctrl) return`. (The light field used to work
// this way too; it is permanent now.)
watch(
	() => addable.value.length > 0,
	(showing) => {
		if (!showing) {
			addCtrl?.$wrapper?.remove();
			addCtrl = null;
			return;
		}
		nextTick(ensureAddControl);
	}
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
			return;
		}
		nextTick(() => {
			ensureLightControl();
			syncLightControl();
		});
	},
	{ immediate: true }
);

// a light system changed elsewhere (Reset, Apply to all) still has to reach its control —
// set_value alone, never a re-render, so the guard in onchange stays honest
watch(() => room.value?.light_system, () => nextTick(syncLightControl));

onBeforeUnmount(destroyControls);
</script>

<style scoped>
/* Three zones down the sidebar: the head, the annexes taking whatever is left, and the
   light + sound systems pinned to the bottom. Only the annex list scrolls. */
.fb-features {
	display: flex;
	flex-direction: column;
	gap: var(--margin-sm);
	flex: 1;
	min-height: 0;
	/* NOT overflow-y:auto — CSS forces the other axis to `auto` alongside it, which makes
	   this a clipping box and cuts every Link dropdown off at the sidebar edge. No
	   z-index escapes an overflow clip. The scroll belongs on the annex list alone, and
	   nothing with a dropdown goes inside it. */
	overflow: visible;
}
.fb-features-annexes {
	display: flex;
	flex-direction: column;
	gap: 6px;
	flex: 1;
	min-height: 0;
}
.fb-annex-list {
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
.fb-annex-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 18px;
}
.fb-annex-initial {
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
.fb-annex {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 6px 0;
	border-bottom: 1px solid var(--border-color);
}
.fb-annex:last-of-type {
	border-bottom: 0;
}
.fb-annex-top {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}
/* flush with the icon above it, not indented under the name — the row is one block, and
   the extra 24px is width the UOM select needs at a 240px sidebar */
.fb-annex-controls {
	display: flex;
	align-items: center;
	gap: 6px;
}
.fb-annex-uom {
	flex: 1;
	min-width: 0;
	font-size: var(--text-sm);
}
.fb-annex-name {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: var(--text-sm);
}
/* the same 26px box as the qty and uom controls beside it, so the three sit on one line */
.fb-annex-remove {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: 26px;
	height: 26px;
	padding: 0;
	--icon-stroke: var(--red-500, #e03636);
	/* a wash rather than a solid fill — one of these sits in every annex row, and a column
	   of full-strength red reads as a column of warnings. Stated in rgba, not a --red-*
	   token, because the transparency is the point: it has to tint whatever is behind it. */
	background: rgba(224, 54, 54, 0.12);
	border: 1px solid rgba(224, 54, 54, 0.28);
	border-radius: var(--border-radius-tiny, 4px);
}
.fb-annex-remove:hover:not(:disabled),
.fb-annex-remove:focus:not(:disabled) {
	background: rgba(224, 54, 54, 0.24);
	border-color: rgba(224, 54, 54, 0.5);
}
/* the last annex cannot go — an amenity is what it is composed of — so the button reads
   as unavailable rather than as a live red one that happens not to work */
.fb-annex-remove:disabled {
	--icon-stroke: var(--text-muted);
	background: var(--control-bg);
	border-color: var(--border-color);
	opacity: 1;
}
/* v-html content carries no scope attribute, hence :deep; block kills the inline
   baseline gap that would push the glyph off centre */
.fb-annex-remove :deep(.icon) {
	display: block;
	margin: 0;
}
.fb-input {
	height: 26px;
	border: 1px solid var(--border-color);
	border-radius: var(--border-radius);
	background: var(--control-bg);
	padding: 0 6px;
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
.fb-add-annex :deep(.frappe-control),
.fb-light-field :deep(.frappe-control) {
	margin-bottom: 0;
}
.fb-add-annex :deep(.form-control),
.fb-light-field :deep(.form-control) {
	height: 26px;
	font-size: var(--text-sm);
}
.fb-add-annex :deep(.control-label),
.fb-add-annex :deep(.help-box),
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
