<template>
	<!-- Sits on the room's own transform, so the icons follow it wherever it is drawn
	     and stay inside it when it is rotated. -->
	<v-group :config="{ x: room.x, y: room.y, rotation: room.rotation || 0, listening: false }">
		<template v-for="a in placed" :key="a.key">
			<!-- the Device's own icon when it has one, else a lettered chip so a device is
			     never invisible just because nobody has picked an icon for it yet -->
			<v-image v-if="a.image_config.image" :config="a.image_config" />
			<template v-else>
				<v-circle :config="a.chip_config" />
				<v-text :config="a.initial_config" />
			</template>
			<!-- an extra device (outside the Amenity's own list): gold, with a "+" on top -->
			<v-text v-if="a.extra_config" :config="a.extra_config" />
		</template>
	</v-group>
</template>

<script setup>
import { computed, inject, ref, watch } from "vue";
import { room_bbox } from "../utils";
import { load_icon_image } from "../icons";
import { darken, EXTRA_DEVICE_COLOR, resolveColor } from "../colors";

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
// master (or an extra device's details), since a room only stores which device and how
// many. An extra device is inked in gold instead of the room's colour.
const devices = computed(() =>
	store.effective_devices(props.room).map((a) => {
		const source = store.device_details(props.room, a.device);
		const extra = store.is_extra_device(props.room, a.device);
		return {
			device: a.device,
			qty: a.qty,
			device_name: source.device_name || a.device,
			icon: source.icon,
			extra,
			color: extra ? EXTRA_DEVICE_COLOR : ink.value,
		};
	})
);

// `icon|colour` -> HTMLImageElement, or null while one is in flight.
//
// Keyed by what is actually drawn, NOT by the device. The master catalogue is fetched
// asynchronously (set_active_layer kicks it off and returns), so this component mounts
// while every device still has `icon: undefined`. Keying by device name claimed that slot
// permanently, and the icon arriving a moment later never got asked for — the row stayed
// on its lettered fallback until the component was destroyed, which is exactly what
// toggling Drawing/Features does. A changing icon is now a different key, so it is.
//
// The colour is in the key for the same reason: it is baked into the bitmap, so a
// recoloured category re-renders rather than reusing the old tint.
const images = ref({});
const image_key = (device, color) => `${device.icon}|${color}`;

watch(
	devices,
	(list) => {
		for (const device of list) {
			if (!device.icon) continue; // nothing to ask for yet
			const key = image_key(device, device.color);
			if (key in images.value) continue; // asked already
			images.value[key] = null; // claim the slot so we ask once
			load_icon_image(device.icon, { color: device.color, outline: true }).then((image) => {
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
	const list = devices.value;
	if (!list.length) return [];

	const box = room_bbox(props.room);
	const per_row = Math.max(1, Math.floor((box.w + GAP) / (SIZE + GAP)));
	const columns = Math.min(list.length, per_row);
	const rows = Math.ceil(list.length / columns);
	const left = box.x + (box.w - (columns * SIZE + (columns - 1) * GAP)) / 2;
	const top = box.y + (box.h - (rows * SIZE + (rows - 1) * GAP)) / 2;

	return list.map((device, index) => {
		const x = left + (index % columns) * (SIZE + GAP);
		const y = top + Math.floor(index / columns) * (SIZE + GAP);
		return {
			key: device.device,
			image_config: { image: images.value[image_key(device, device.color)], x, y, width: SIZE, height: SIZE },
			chip_config: {
				x: x + SIZE / 2,
				y: y + SIZE / 2,
				radius: SIZE / 2,
				fill: "#ffffff",
				stroke: device.color,
				strokeWidth: device.extra ? 1.5 : 1,
				opacity: 0.9,
			},
			initial_config: {
				x,
				y: y + SIZE / 2 - 5,
				width: SIZE,
				text: (device.device_name || device.device || "?").trim().charAt(0).toUpperCase(),
				align: "center",
				fontSize: 10,
				fontStyle: "bold",
				fill: device.color,
			},
			// a superscript "+" on the icon's top-right corner, haloed in white so it reads
			// over the room's fill and whatever the icon draws beneath it
			extra_config: device.extra
				? {
						x: x + SIZE - 3,
						y: y - 6,
						text: "+",
						fontSize: 12,
						fontStyle: "bold",
						fill: EXTRA_DEVICE_COLOR,
						stroke: "#ffffff",
						strokeWidth: 2,
						fillAfterStrokeEnabled: true,
					}
				: null,
		};
	});
});
</script>
