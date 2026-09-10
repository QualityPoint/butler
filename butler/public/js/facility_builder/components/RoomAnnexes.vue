<template>
	<!-- Sits on the room's own transform, so the icons follow it wherever it is drawn
	     and stay inside it when it is rotated. -->
	<v-group :config="{ x: room.x, y: room.y, rotation: room.rotation || 0, listening: false }">
		<template v-for="a in placed" :key="a.key">
			<!-- the Annex's own icon when it has one, else a lettered chip so an annex is
			     never invisible just because nobody has picked an icon for it yet -->
			<v-image v-if="a.image_config.image" :config="a.image_config" />
			<template v-else>
				<v-circle :config="a.chip_config" />
				<v-text :config="a.initial_config" />
			</template>
		</template>
	</v-group>
</template>

<script setup>
import { computed, inject, ref, watch } from "vue";
import { room_bbox } from "../utils";
import { load_icon_image } from "../icons";
import { darken, resolveColor } from "../colors";

const props = defineProps({ room: { type: Object, required: true } });
const store = inject("$store");

const SIZE = 18; // icon box, in world px
const GAP = 6;

// Stroked in the room's own category colour, darkened enough to read against its fill.
// An outline icon carries no colour of its own — something has to paint it — and the
// amenity's colour is the one choice that is neither black nor arbitrary.
const ink = computed(() =>
	darken(resolveColor(props.room.category, store.category_colors.value))
);

// What this placement actually holds — its own list once edited, the Amenity's
// standard composition until then. The icon and display name still come from the
// master, since a room only stores which annex and how many.
const annexes = computed(() => {
	const master = {};
	for (const a of store.annexes_for(props.room.amenity)) master[a.annex] = a;
	return store.effective_annexes(props.room).map((a) => ({
		annex: a.annex,
		qty: a.qty,
		annex_name: master[a.annex]?.annex_name || a.annex,
		icon: master[a.annex]?.icon,
	}));
});

// `icon|colour` -> HTMLImageElement, or null while one is in flight.
//
// Keyed by what is actually drawn, NOT by the annex. The master catalogue is fetched
// asynchronously (set_active_layer kicks it off and returns), so this component mounts
// while every annex still has `icon: undefined`. Keying by annex name claimed that slot
// permanently, and the icon arriving a moment later never got asked for — the row stayed
// on its lettered fallback until the component was destroyed, which is exactly what
// toggling Drawing/Features does. A changing icon is now a different key, so it is.
//
// The colour is in the key for the same reason: it is baked into the bitmap, so a
// recoloured category re-renders rather than reusing the old tint.
const images = ref({});
const image_key = (annex, color) => `${annex.icon}|${color}`;

watch(
	[annexes, ink],
	([list, color]) => {
		for (const annex of list) {
			if (!annex.icon) continue; // nothing to ask for yet
			const key = image_key(annex, color);
			if (key in images.value) continue; // asked already
			images.value[key] = null; // claim the slot so we ask once
			load_icon_image(annex.icon, { color, outline: true }).then((image) => {
				if (image) images.value[key] = image;
			});
		}
	},
	{ immediate: true }
);

// Lay the icons out as a grid centred in the room, as many per row as it can take.
// A room too small for even one still gets a single column — overflowing a tiny shape
// beats hiding what it is composed of.
const placed = computed(() => {
	const list = annexes.value;
	if (!list.length) return [];

	const box = room_bbox(props.room);
	const per_row = Math.max(1, Math.floor((box.w + GAP) / (SIZE + GAP)));
	const columns = Math.min(list.length, per_row);
	const rows = Math.ceil(list.length / columns);
	const left = box.x + (box.w - (columns * SIZE + (columns - 1) * GAP)) / 2;
	const top = box.y + (box.h - (rows * SIZE + (rows - 1) * GAP)) / 2;

	return list.map((annex, index) => {
		const x = left + (index % columns) * (SIZE + GAP);
		const y = top + Math.floor(index / columns) * (SIZE + GAP);
		return {
			key: annex.annex,
			image_config: { image: images.value[image_key(annex, ink.value)], x, y, width: SIZE, height: SIZE },
			chip_config: {
				x: x + SIZE / 2,
				y: y + SIZE / 2,
				radius: SIZE / 2,
				fill: "#ffffff",
				stroke: ink.value,
				strokeWidth: 1,
				opacity: 0.9,
			},
			initial_config: {
				x,
				y: y + SIZE / 2 - 5,
				width: SIZE,
				text: (annex.annex_name || annex.annex || "?").trim().charAt(0).toUpperCase(),
				align: "center",
				fontSize: 10,
				fontStyle: "bold",
				fill: ink.value,
			},
		};
	});
});
</script>
