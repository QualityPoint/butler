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

		<div class="fb-spacer" />

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
import { inject } from "vue";

const store = inject("$store");
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
	border-radius: var(--border-radius);
	padding: 0 6px;
}
.fb-input-scale {
	width: 90px;
}
.fb-spacer {
	flex: 1;
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
