import { ref, computed, inject, watch, nextTick } from "vue";
import { blank_design, room_area_m2, rect_to_polygon_points, room_bbox } from "./utils";

export function getStore(facility_name) {
	// --- state ---
	let facility = ref(null); // the Facility doc
	let design = ref(null); // parsed geometry envelope
	let space_types = ref([]); // Space Type catalog (palette)
	let active_floor_type = ref(null); // Floor Type currently shown
	let selected_id = ref(null); // selected room id
	let dirty = ref(false);
	let active_layer = ref("drawing"); // "drawing" | "blueprint" (Photoshop-style)
	let calibrating = ref(false); // measurement calibration in progress
	let blueprint_fit_nonce = ref(0); // bump to ask the canvas to re-fit the blueprint
	let blueprint_page_count = ref(1); // pages in the active blueprint (PDF)

	// --- derived ---
	let active_floor = computed(() =>
		(design.value?.floors || []).find((f) => f.floor_type === active_floor_type.value)
	);
	let ppm = computed(() => design.value?.scale?.pixels_per_meter || 50);
	let snap_enabled = computed(() => design.value?.canvas?.snap === true); // default OFF
	let rooms_opacity = computed(() => design.value?.canvas?.rooms_opacity ?? 1);
	let view_scale = ref(1); // mirror of the canvas zoom, for the footer readout
	let zoom_api = ref(null); // { in, out, reset, fit } registered by the Canvas
	let selected_room = computed(() =>
		active_floor.value?.rooms.find((r) => r.id === selected_id.value)
	);
	// the blueprints child-table row for the active floor (the SOURCE: file + page)
	let active_blueprint_row = computed(() => {
		const rows = facility.value?.blueprints || [];
		return rows.find((r) => r.floor_type === active_floor_type.value) || null;
	});
	let active_blueprint_url = computed(() => active_blueprint_row.value?.blueprint || null);
	let active_blueprint_page = computed(() => active_blueprint_row.value?.page || 1);
	// the blueprint PLACEMENT transform for the active floor (lives in geometry)
	let active_blueprint = computed(() => active_floor.value?.blueprint || null);
	// { "Bedroom": "#bcd0f7", ... } — only space types that have a chosen color
	let space_colors = computed(() => {
		const map = {};
		for (const st of space_types.value) {
			if (st.color) map[st.name] = st.color;
		}
		return map;
	});

	// --- load ---
	function fetch() {
		return new Promise((resolve) => {
			frappe.model.clear_doc("Facility", facility_name);
			frappe.model.with_doc("Facility", facility_name, () => {
				let doc = frappe.get_doc("Facility", facility_name);
				facility.value = doc;
				design.value = doc.geometry ? JSON.parse(doc.geometry) : blank_design();
				active_floor_type.value = design.value.floors[0]?.floor_type ?? null;
				selected_id.value = null;
				load_space_types().then(() => {
					nextTick(() => (dirty.value = false));
					resolve();
				});
			});
		});
	}

	function load_space_types() {
		return frappe.db
			.get_list("Space Type", { fields: ["name", "space_name", "color"], limit: 0 })
			.then((rows) => (space_types.value = rows));
	}

	// --- save (geometry JSON is the sole source of truth) ---
	function save_changes() {
		frappe.dom.freeze(__("Saving..."));
		facility.value.geometry = JSON.stringify(design.value);

		return frappe
			.call("frappe.client.save", { doc: facility.value })
			.then(() => fetch())
			.always(() => frappe.dom.unfreeze());
	}

	function reset_changes() {
		return fetch();
	}

	// --- floor mutations ---
	function add_floor(floor_type) {
		if (!floor_type || design.value.floors.some((f) => f.floor_type === floor_type)) {
			active_floor_type.value = floor_type;
			return;
		}
		design.value.floors.push({ floor_type, rooms: [] });
		active_floor_type.value = floor_type;
	}

	function remove_floor(floor_type) {
		design.value.floors = design.value.floors.filter((f) => f.floor_type !== floor_type);
		if (active_floor_type.value === floor_type) {
			active_floor_type.value = design.value.floors[0]?.floor_type ?? null;
		}
	}

	// --- room mutations ---
	function add_room(partial) {
		if (!active_floor.value) return;
		let room = {
			id: frappe.utils.get_random(8),
			space_type: partial.space_type,
			shape: "rect",
			x: partial.x ?? 40,
			y: partial.y ?? 40,
			w: partial.w ?? 120,
			h: partial.h ?? 100,
			rotation: 0,
			area: 0,
			remarks: "",
		};
		room.area = room_area_m2(room, ppm.value);
		active_floor.value.rooms.push(room);
		selected_id.value = room.id;
	}

	function update_room(id, patch) {
		let room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room) return;
		Object.assign(room, patch);
		room.area = room_area_m2(room, ppm.value);
	}

	function delete_room(id) {
		if (!active_floor.value) return;
		active_floor.value.rooms = active_floor.value.rooms.filter((r) => r.id !== id);
		if (selected_id.value === id) selected_id.value = null;
	}

	// turn a rectangle into an editable 4-vertex polygon (basis for L-shapes etc.)
	function convert_to_polygon(id) {
		let room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room || room.shape === "polygon") return;
		room.shape = "polygon";
		room.points = rect_to_polygon_points(room.w, room.h);
		room.area = room_area_m2(room, ppm.value);
	}

	// collapse a polygon back to its bounding rectangle (its longest h/v extent)
	function convert_to_rectangle(id) {
		let room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room || room.shape !== "polygon") return;
		const b = room_bbox(room); // local bbox {x,y,w,h} relative to room origin
		room.x += b.x;
		room.y += b.y;
		room.w = Math.max(1, b.w);
		room.h = Math.max(1, b.h);
		room.shape = "rect";
		delete room.points;
		room.area = room_area_m2(room, ppm.value);
	}

	// --- canvas / scale settings ---
	function recompute_all_areas() {
		for (const floor of design.value.floors) {
			for (const room of floor.rooms) {
				room.area = room_area_m2(room, ppm.value);
			}
		}
	}

	function set_scale(pixels_per_meter) {
		design.value.scale.pixels_per_meter = Math.max(1, Number(pixels_per_meter) || 50);
		recompute_all_areas();
	}

	function set_grid(grid) {
		design.value.canvas.grid = Math.max(1, Number(grid) || 20);
	}

	// snap a coordinate to the grid — or pass it through when snapping is off
	// (off lets you freely trace rooms onto a blueprint)
	function snap_coord(v) {
		if (design.value.canvas.snap !== true) return v; // off by default → free placement
		const g = design.value.canvas.grid || 1;
		return Math.round(v / g) * g;
	}

	function toggle_snap() {
		design.value.canvas.snap = !snap_enabled.value;
	}

	function set_rooms_opacity(v) {
		design.value.canvas.rooms_opacity = Math.min(1, Math.max(0.1, Number(v) || 1));
	}

	// --- blueprint placement (per active floor, stored in geometry) ---
	function set_blueprint_transform(patch) {
		if (!active_floor.value) return;
		const base = active_floor.value.blueprint || {
			x: 0,
			y: 0,
			scaleX: 1,
			scaleY: 1,
			rotation: 0,
			opacity: 0.6,
		};
		active_floor.value.blueprint = Object.assign({}, base, patch);
	}

	// --- blueprint page (the SOURCE, stored in the child-table row) ---
	function set_blueprint_page(page) {
		const row = active_blueprint_row.value;
		if (!row) return;
		row.page = Math.max(1, Number(page) || 1);
		dirty.value = true; // child-table change isn't caught by the geometry watch
	}

	function clear_blueprint_placement() {
		if (active_floor.value) active_floor.value.blueprint = null;
	}

	function request_blueprint_fit() {
		blueprint_fit_nonce.value++;
	}

	function set_active_layer(layer) {
		active_layer.value = layer;
		if (layer === "blueprint") selected_id.value = null; // hide room selection
		if (layer !== "blueprint") calibrating.value = false;
	}

	function start_calibration() {
		calibrating.value = true;
	}

	function cancel_calibration() {
		calibrating.value = false;
	}

	// upload: set/replace the blueprint FILE row for the active floor, persist immediately
	function set_blueprint_file(file_url) {
		if (!active_floor_type.value) return Promise.resolve();
		let rows = facility.value.blueprints || (facility.value.blueprints = []);
		let row = rows.find((r) => r.floor_type === active_floor_type.value);
		if (row) {
			row.blueprint = file_url;
		} else {
			rows.push({
				doctype: "Facility Blueprint",
				floor_type: active_floor_type.value,
				blueprint: file_url,
				page: 1,
			});
		}
		if (active_floor.value) active_floor.value.blueprint = null; // re-fit to the new file
		return save_changes();
	}

	// --- dirty tracking ---
	watch(design, () => (dirty.value = true), { deep: true });

	return {
		facility,
		design,
		space_types,
		active_floor_type,
		active_floor,
		selected_id,
		selected_room,
		space_colors,
		snap_enabled,
		rooms_opacity,
		view_scale,
		zoom_api,
		active_blueprint_row,
		active_blueprint_url,
		active_blueprint_page,
		active_blueprint,
		active_layer,
		calibrating,
		blueprint_fit_nonce,
		blueprint_page_count,
		ppm,
		dirty,
		fetch,
		save_changes,
		reset_changes,
		add_floor,
		remove_floor,
		add_room,
		update_room,
		delete_room,
		convert_to_polygon,
		convert_to_rectangle,
		set_scale,
		set_grid,
		snap_coord,
		toggle_snap,
		set_rooms_opacity,
		set_blueprint_transform,
		set_blueprint_page,
		clear_blueprint_placement,
		request_blueprint_fit,
		set_active_layer,
		set_blueprint_file,
		start_calibration,
		cancel_calibration,
	};
}

export function useStore() {
	let store = ref(inject("$store"));
	return { store };
}
