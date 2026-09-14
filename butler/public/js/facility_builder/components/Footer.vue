<template>
	<div class="fb-footer">
		<div class="fb-group">
			<label>{{ __("Scale") }}</label>
			<span class="fb-scale">1 m =
				<input
					type="number"
					min="1"
					class="fb-input fb-input-scale"
					:value="store.ppm.value"
					@change="store.set_scale($event.target.value)"
				/> px
			</span>
		</div>
		<div class="fb-group">
			<label>{{ __("Grid") }}</label>
			<input
				type="number"
				min="1"
				class="fb-input"
				:value="store.design.value.canvas.grid"
				@change="store.set_grid($event.target.value)"
			/>
		</div>

		<!-- The dependency cap lives here, not in the sidebar: the sidebar swaps
		     AmenityPalette for FeaturesPanel on layer change, and this footer renders on
		     every layer. It also sits outside .fb-canvas-wrap's overflow, so it can be
		     neither clipped nor panned away. A chip rather than an alert, because a toast
		     disappears and this has to stay until the plan fixes it. -->
		<div class="fb-spacer">
			<button
				v-if="store.has_dependency_shortfall.value"
				type="button"
				class="fb-dep-warning"
				role="status"
				aria-live="polite"
				:title="__('Click for details')"
				@click="showDependencies"
			>
				<span class="fb-dep-dot" />
				{{ warningText }}
			</button>
		</div>

		<!-- zoom controls (far right) -->
		<div class="fb-zoom">
			<button class="btn btn-xs btn-default" :title="__('Zoom out')" @click="store.zoom_api.value?.out()">
				<svg class="icon icon-sm" viewBox="0 0 16 16">
					<path d="M3 8 L13 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" />
				</svg>
			</button>
			<span class="fb-zoom-pct" :title="__('Reset to 100%')" @click="store.zoom_api.value?.reset()">
				{{ Math.round(store.view_scale.value * 100) }}%
			</span>
			<button class="btn btn-xs btn-default" :title="__('Zoom in')" @click="store.zoom_api.value?.in()">
				<svg class="icon icon-sm"><use href="#icon-add"></use></svg>
			</button>
			<button class="btn btn-xs btn-default" :title="__('Fit canvas to view')" @click="store.zoom_api.value?.fit()">
				{{ __("Fit") }}
			</button>
		</div>
	</div>
</template>

<script setup>
import { computed, inject } from "vue";

const store = inject("$store");

// One breach names it outright; several would not fit, so the chip counts them and the
// detail is one click away. Built here rather than in the template because a Vue template
// only resolves `__` and `frappe` (SetVueGlobals) — everything else must come from scope.
const warningText = computed(() => {
	const shortfalls = store.dependency_shortfalls.value;
	if (shortfalls.length === 1) {
		const { dependant, primary, short } = shortfalls[0];
		return __("{0} needs {1} more {2}", [
			store.amenity_label(dependant), short, store.amenity_label(primary),
		]);
	}
	const dependants = new Set(shortfalls.map((s) => s.dependant));
	return __("{0} amenities are missing a primary", [dependants.size]);
});

// Deliberately the same sentences the server produces in
// ButlerQuotation.validate_dependencies, so what you read while drawing is what you read
// on save and at submit.
function showDependencies() {
	const lines = store.dependency_shortfalls.value.map((s) => {
		const dependant = store.amenity_label(s.dependant);
		const primary = store.amenity_label(s.primary);
		return s.capacity
			? __("{0} — {1} placed, but only {2} {3}", [dependant, s.placed, s.capacity, primary])
			: __("{0} — {1} placed, but no {2} drawn", [dependant, s.placed, primary]);
	});
	frappe.msgprint({
		title: __("Dependencies not met"),
		indicator: "orange",
		message:
			"<ul>" + lines.map((l) => `<li>${frappe.utils.escape_html(l)}</li>`).join("") + "</ul>" +
			__("Draw the missing primary amenities, or remove the extra dependants."),
	});
}
</script>

<style scoped>
.fb-footer {
	display: flex;
	align-items: center;
	gap: 16px;
	height: 44px;
	flex-shrink: 0;
	box-sizing: border-box;
	padding: 0 var(--padding-md);
	border-top: 1px solid var(--border-color);
	background: var(--card-bg, #fff);
	font-size: var(--text-sm);
}
.fb-group {
	display: flex;
	align-items: center;
	gap: 6px;
}
.fb-group label {
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
	/* form controls do not inherit either: unset, they render as the UA's white box with
	   black text, which survives dark mode as a bright rectangle */
	background: var(--control-bg);
	color: var(--text-color);
	border-radius: var(--border-radius);
	padding: 0 6px;
}
.fb-input-scale {
	width: 90px;
}
.fb-spacer {
	flex: 1;
	min-width: 0;
	display: flex;
	align-items: center;
}
/* a status chip, not a button: no border, no fill until you point at it */
.fb-dep-warning {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	padding: 3px 8px;
	border: 0;
	border-radius: var(--border-radius);
	background: transparent;
	color: var(--orange-600, #b7791f);
	font-size: var(--text-sm);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	cursor: pointer;
}
.fb-dep-warning:hover {
	background: var(--orange-100, #fefcbf);
}
.fb-dep-dot {
	flex-shrink: 0;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--orange-500, #ed8936);
}
.fb-zoom {
	display: flex;
	align-items: center;
	gap: 2px;
}
.fb-zoom .btn {
	padding: 2px 6px;
}
.fb-zoom-pct {
	min-width: 46px;
	text-align: center;
	font-size: var(--text-xs);
	color: var(--text-light);
	cursor: pointer;
	user-select: none;
}
</style>
