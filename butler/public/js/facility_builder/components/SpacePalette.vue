<template>
	<div class="fb-palette">
		<div class="fb-palette-title">{{ __("Space Types") }}</div>
		<p v-if="!store.space_types.value.length" class="fb-palette-empty">
			{{ __("No Space Types defined yet.") }}
		</p>
		<div
			v-for="st in store.space_types.value"
			:key="st.name"
			class="fb-chip"
			draggable="true"
			:title="__('Drag onto the canvas')"
			@dragstart="onDragStart($event, st.name)"
			@dblclick="onAdd(st.name)"
		>
			<span class="fb-chip-swatch" :style="{ background: st.color || colorFor(st.name) }"></span>
			{{ st.space_name || st.name }}
		</div>
		<p class="fb-palette-hint">{{ __("Drag a space onto the floor, or double-click to drop it.") }}</p>
	</div>
</template>

<script setup>
import { inject } from "vue";
import { colorFor } from "../colors";

const store = inject("$store");

function onDragStart(e, space_type) {
	e.dataTransfer.setData("text/space-type", space_type);
	e.dataTransfer.effectAllowed = "copy";
}

function onAdd(space_type) {
	store.add_room({ space_type });
}
</script>

<style scoped>
.fb-palette-title {
	font-weight: 600;
	margin-bottom: 8px;
}
.fb-palette-empty,
.fb-palette-hint {
	font-size: var(--text-xs);
	color: var(--text-muted);
}
.fb-palette-hint {
	margin-top: 12px;
}
.fb-chip {
	display: flex;
	align-items: center;
	gap: 8px;
	border: 1px solid var(--border-color);
	border-radius: var(--border-radius);
	padding: 6px 10px;
	margin-bottom: 6px;
	background: var(--card-bg, #fff);
	cursor: grab;
	font-size: var(--text-sm);
	user-select: none;
}
.fb-chip:active {
	cursor: grabbing;
}
.fb-chip-swatch {
	width: 14px;
	height: 14px;
	border-radius: 3px;
	flex-shrink: 0;
}
</style>
