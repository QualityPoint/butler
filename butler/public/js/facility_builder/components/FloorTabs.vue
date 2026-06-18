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
			<span v-if="!store.read_only.value" class="fb-tab-remove" @click.stop="confirm_remove(floor.floor_type)">×</span>
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
	border-radius: var(--border-radius);
	padding: 4px 10px;
	font-size: var(--text-sm);
	white-space: nowrap;
	cursor: pointer;
}
.fb-tab.active {
	border-color: var(--primary);
	color: var(--primary);
	font-weight: 600;
}
.fb-tab-count {
	font-size: var(--text-xs);
	background: var(--subtle-fg, #eef);
	border-radius: 8px;
	padding: 0 6px;
}
.fb-tab-remove {
	color: var(--text-muted);
	font-size: var(--text-lg);
	line-height: 1;
}
.fb-tab-remove:hover {
	color: var(--red-500, #e24c4c);
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
