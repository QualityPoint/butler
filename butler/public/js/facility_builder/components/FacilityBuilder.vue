<template>
	<div v-if="ready" ref="rootEl" class="facility-builder" :style="rootStyle">
		<div class="fb-sidebar">
			<SpacePalette />
		</div>
		<div class="fb-main">
			<FloorTabs />
			<Toolbar v-if="$store.active_floor.value" />
			<div class="fb-canvas-wrap">
				<Canvas v-if="$store.active_floor.value" />
				<div v-else class="fb-empty">
					{{ __("Add a floor to start designing.") }}
				</div>
			</div>
			<Footer v-if="$store.active_floor.value" />
		</div>
	</div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick, provide } from "vue";
import { getStore } from "../store";
import SpacePalette from "./SpacePalette.vue";
import FloorTabs from "./FloorTabs.vue";
import Toolbar from "./Toolbar.vue";
import Canvas from "./Canvas.vue";
import Footer from "./Footer.vue";

const props = defineProps(["facility_name"]);

let ready = ref(false);
const rootEl = ref(null);
const builderHeight = ref(null);

let $store = computed(() => getStore(props.facility_name));

// fill exactly from the builder's top down to the viewport bottom (no guessed offset)
const rootStyle = computed(() =>
	builderHeight.value ? { height: builderHeight.value + "px" } : {}
);
function measureHeight() {
	if (!rootEl.value) return;
	builderHeight.value = window.innerHeight - rootEl.value.getBoundingClientRect().top;
}

// provide the store instance to the whole subtree
provide("$store", $store.value);

onMounted(() => {
	$store.value.fetch().then(() => {
		ready.value = true;
		nextTick(measureHeight);
	});
	window.addEventListener("resize", measureHeight);
});
onBeforeUnmount(() => window.removeEventListener("resize", measureHeight));

defineExpose({ $store });
</script>

<style scoped>
.facility-builder {
	display: flex;
	width: 100%;
	height: calc(100vh - 95px);
}
.fb-sidebar {
	width: 220px;
	flex-shrink: 0;
	border-right: 1px solid var(--border-color);
	padding: var(--padding-md);
	overflow-y: auto;
}
.fb-main {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-width: 0;
}
.fb-canvas-wrap {
	flex: 1;
	overflow: hidden;
	min-height: 0;
	position: relative;
	background: var(--subtle-fg, #f4f5f6);
}
.fb-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	color: var(--text-muted);
}
</style>
