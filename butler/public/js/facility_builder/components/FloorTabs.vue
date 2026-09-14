<template>
	<div class="fb-floor-tabs">
		<button
			v-for="floor in store.design.value.floors"
			:key="floor.floor_type"
			class="fb-tab"
			:class="{ active: floor.floor_type === store.active_floor_type.value }"
			@click="store.active_floor_type.value = floor.floor_type"
		>
			{{ __(floor.floor_type) }}
			<span class="fb-tab-count">{{ floor.rooms.length }}</span>
			<!-- the same icon and the same red wash as the annex remove button, so removing
			     means the same thing wherever it appears -->
			<span
				v-if="!store.read_only.value"
				class="fb-tab-remove"
				:title="__('Remove this floor')"
				@click.stop="confirm_remove(floor.floor_type)"
			>
				<svg class="icon icon-xs"><use href="#icon-x"></use></svg>
			</span>
		</button>
		<button v-if="!store.read_only.value" class="btn btn-xs btn-primary fb-tab-add" @click="add_floor">
			<svg class="icon icon-sm"><use href="#icon-add"></use></svg>
			{{ __("Add Floor") }}
		</button>
	</div>
</template>

<script setup>
import { inject } from "vue";

const store = inject("$store");

function add_floor() {
	let existing = store.design.value.floors.map((f) => f.floor_type);
	let d = new frappe.ui.Dialog({
		title: __("Add Floor"),
		fields: [
			{
				label: __("Floor Type"),
				fieldname: "floor_type",
				fieldtype: "Link",
				options: "Floor Type",
				reqd: 1,
				get_query: () => ({ filters: { name: ["not in", existing] } }),
			},
		],
		primary_action_label: __("Add"),
		primary_action({ floor_type }) {
			store.add_floor(floor_type);
			d.hide();
		},
	});
	d.show();
}

function confirm_remove(floor_type) {
	frappe.confirm(__("Remove floor {0} and all its rooms?", [__(floor_type)]), () =>
		store.remove_floor(floor_type)
	);
}
</script>

<style scoped>
.fb-floor-tabs {
	display: flex;
	gap: 4px;
	padding: 6px var(--padding-md);
	border-bottom: 1px solid var(--border-color);
	overflow-x: auto;
}
.fb-tab {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	border: 1px solid var(--border-color);
	background: var(--card-bg, #fff);
	/* A <button> does not inherit `color` — without this it falls back to the UA's
	   `buttontext`, which is black, and --card-bg is --gray-900 in dark mode. That is the
	   black-on-black tab. Every bare button that paints its own background needs this. */
	color: var(--text-color);
	border-radius: var(--border-radius);
	padding: 4px 10px;
	font-size: var(--text-sm);
	white-space: nowrap;
	cursor: pointer;
}
.fb-tab.active {
	/* NOT --primary: that is a hardcoded #171717 in the desk bundle and is never redefined
	   for dark mode, so it stayed black on a --gray-900 tab. --text-color is the same near
	   black in light mode and near white in dark, which is what this rule always meant. */
	border-color: var(--text-color);
	color: var(--text-color);
	font-weight: 600;
}
.fb-tab-count {
	font-size: var(--text-xs);
	/* its own colour rather than inheriting the button's: on the active tab that is the
	   full-strength --text-color, and a count as loud as the floor name competes with it */
	color: var(--text-muted);
	background: var(--subtle-fg, #eef);
	border-radius: 8px;
	padding: 0 6px;
}
.fb-tab-remove {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 18px;
	height: 18px;
	border-radius: var(--border-radius-tiny, 4px);
	--icon-stroke: var(--red-500, #e03636);
	background: rgba(224, 54, 54, 0.12);
}
.fb-tab-remove:hover {
	background: rgba(224, 54, 54, 0.24);
}
.fb-tab-remove .icon {
	display: block;
	margin: 0;
}
.fb-tab-add {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	white-space: nowrap;
	flex-shrink: 0;
}
.fb-tab-add .icon {
	margin: 0;
}
</style>
