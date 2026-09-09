import { ref, computed, inject, watch, nextTick } from "vue";
import {
	blank_design,
	room_area_m2,
	rect_to_polygon_points,
	room_bbox,
	room_world_aabb,
	shape_extent,
	ngon_points,
} from "./utils";

const DEFAULT_POINT_SIZE = 24;

// The builder runs in one of two modes (carried in the route):
//   • "facility"  → an ephemeral session over a Facility: lay out floors + amenities;
//                   on Save (with ≥1 amenity) a NEW draft Butler Quotation is created and
//                   the route switches to it. Nothing persists on the Facility but blueprint files.
//   • "quotation" → edit an existing Butler Quotation's geometry (draft-only).
// Rooms represent AMENITIES (room.amenity), colored by their Amenity Category.
export function getStore(mode, target_name) {
	const is_facility_mode = mode === "facility";

	// --- state ---
	let quotation = ref(null); // the Butler Quotation doc (null in facility mode until saved)
	let facility = ref(null); // the Facility doc (source of blueprint files)
	let design = ref(null); // parsed geometry envelope (spatial only)
	let amenities = ref([]); // Amenity catalog (palette)
	let categories = ref([]); // Amenity Category catalog (filters + colors)
	let bundle_limits = ref({}); // { category -> amenity_count } for the active bundle

	// order config (mirrors the quotation's own fields — read on open, written on save)
	let order_type = ref("Amenities"); // "Amenities" | "Bundle" | "Quotation"
	let bundle_type = ref(null); // Link -> Butler Bundle (only when order_type === "Bundle")

	// palette filter state (ephemeral — not persisted)
	let selected_categories = ref([]); // category names chosen in the "Amenity Category" multiselect
	let selected_amenity = ref(null); // single amenity chosen in the "Amenity" link filter

	// active tool: select (default) | pen (freehand) | point | rect | ellipse | triangle | pentagon | hexagon
	let active_tool = ref("select");
	let active_amenity = ref(null); // amenity picked in the palette — drawn onto the canvas
	let pen_room_id = ref(null); // id of the polygon room currently being traced
	let draw_id = ref(null); // id of a shape being click-dragged into size
	let _draw_origin = { x: 0, y: 0 }; // drag start (world coords) for shape drawing
	let clipboard = ref([]); // copied room snapshots (Ctrl+C / Ctrl+V)
	let point_style = ref({ icon: null, color: null, size: DEFAULT_POINT_SIZE }); // defaults for new points

	let active_floor_type = ref(null); // Floor Type currently shown
	let selected_ids = ref([]); // selected room ids (multi-select)
	let dirty = ref(false);
	let active_layer = ref("drawing"); // "drawing" | "blueprint" | "features" (Photoshop-style)
	let annexes_by_amenity = ref({}); // amenity name -> its annexes, for the Features layer
	let amenity_options = ref({}); // amenity name -> what it offers (light systems, sound)
	let show_annex_icons = ref(true); // draw the annex icons on the Features layer
	let calibrating = ref(false); // measurement calibration in progress
	let blueprint_fit_nonce = ref(0); // bump to ask the canvas to re-fit the blueprint
	let blueprint_page_count = ref(1); // pages in the active blueprint (PDF)

	// --- derived ---
	// facility sessions are always editable; quotations are view-only once submitted/cancelled
	let read_only = computed(() =>
		is_facility_mode ? false : (quotation.value?.docstatus ?? 0) !== 0
	);
	let active_floor = computed(() =>
		(design.value?.floors || []).find((f) => f.floor_type === active_floor_type.value)
	);
	let ppm = computed(() => design.value?.scale?.pixels_per_meter || 50);
	let snap_enabled = computed(() => design.value?.canvas?.snap === true); // default OFF
	let rooms_opacity = computed(() => design.value?.canvas?.rooms_opacity ?? 1);
	let view_scale = ref(1); // mirror of the canvas zoom, for the footer readout
	let zoom_api = ref(null); // { in, out, reset, fit } registered by the Canvas
	// all selected rooms; `selected_room` is the single one (for toolbar editing) or null
	let selected_rooms = computed(() =>
		(active_floor.value?.rooms || []).filter((r) => selected_ids.value.includes(r.id))
	);
	let selected_room = computed(() =>
		selected_ids.value.length === 1 ? selected_rooms.value[0] || null : null
	);
	function is_selected(id) {
		return selected_ids.value.includes(id);
	}
	function select_only(id) {
		selected_ids.value = id ? [id] : [];
	}
	function toggle_select(id) {
		selected_ids.value = is_selected(id)
			? selected_ids.value.filter((x) => x !== id)
			: [...selected_ids.value, id];
	}
	function select_all() {
		selected_ids.value = (active_floor.value?.rooms || []).map((r) => r.id);
	}
	function clear_selection() {
		selected_ids.value = [];
	}
	// marquee (rubber-band) select — rooms whose world AABB intersects the rect
	// (rotation-aware, so rotated shapes are picked by their true extent)
	function select_within(x1, y1, x2, y2) {
		const left = Math.min(x1, x2);
		const right = Math.max(x1, x2);
		const top = Math.min(y1, y2);
		const bottom = Math.max(y1, y2);
		const ids = [];
		for (const r of active_floor.value?.rooms || []) {
			const a = room_world_aabb(r);
			if (a.x <= right && a.x + a.w >= left && a.y <= bottom && a.y + a.h >= top) ids.push(r.id);
		}
		selected_ids.value = ids;
	}
	// the blueprints child-table row for the active floor (the SOURCE: file + page) — lives on the FACILITY
	let active_blueprint_row = computed(() => {
		const rows = facility.value?.blueprints || [];
		return rows.find((r) => r.floor_type === active_floor_type.value) || null;
	});
	let active_blueprint_url = computed(() => active_blueprint_row.value?.blueprint || null);
	let active_blueprint_page = computed(() => active_blueprint_row.value?.page || 1);
	// the blueprint PLACEMENT transform for the active floor (lives in geometry → on the quotation)
	let active_blueprint = computed(() => active_floor.value?.blueprint || null);

	// quick lookup: amenity name -> { amenity_category, standard_price, image, flags }
	let amenity_index = computed(() => {
		const map = {};
		for (const a of amenities.value) map[a.name] = a;
		return map;
	});
	// { "Spa": "#bcd0f7", ... } — Amenity Category color, for room fills + swatches
	let category_colors = computed(() => {
		const map = {};
		for (const c of categories.value) {
			if (c.color) map[c.name] = c.color;
		}
		return map;
	});

	// categories available for the current order config
	let available_categories = computed(() => {
		if (order_type.value === "Bundle") {
			// limited to the chosen bundle's categories (from Amenity Category.bundles)
			return categories.value.filter((c) => c.name in bundle_limits.value);
		}
		return categories.value;
	});

	// category names allowed by the current order/bundle + "Amenity Category" filter
	// (drives both the palette list and the Amenity link's query)
	let allowed_category_names = computed(() => {
		let cats = available_categories.value.map((c) => c.name);
		if (selected_categories.value.length) {
			const picked = new Set(selected_categories.value);
			cats = cats.filter((c) => picked.has(c));
		}
		return cats;
	});

	// amenities after order/bundle + category filtering
	let category_filtered_amenities = computed(() => {
		const allowed = new Set(allowed_category_names.value);
		return amenities.value.filter((a) => allowed.has(a.amenity_category));
	});

	// final palette list: category-filtered, then narrowed by the single Amenity link
	let filtered_amenities = computed(() => {
		if (!selected_amenity.value) return category_filtered_amenities.value;
		return category_filtered_amenities.value.filter((a) => a.name === selected_amenity.value);
	});

	// total placed amenity rooms across all floors
	let placed_count = computed(() => {
		let n = 0;
		for (const floor of design.value?.floors || []) {
			for (const room of floor.rooms) if (room.amenity) n++;
		}
		return n;
	});

	// placement count per category (sum across all floors) — for bundle limit enforcement
	let category_counts = computed(() => {
		const counts = {};
		for (const floor of design.value?.floors || []) {
			for (const room of floor.rooms) {
				const cat = room.category;
				if (cat) counts[cat] = (counts[cat] || 0) + 1;
			}
		}
		return counts;
	});

	function category_is_full(category) {
		if (order_type.value !== "Bundle") return false;
		const limit = bundle_limits.value[category];
		if (limit == null) return false;
		return (category_counts.value[category] || 0) >= limit;
	}

	// --- load ---
	function fetch() {
		return is_facility_mode ? fetch_facility() : fetch_quotation();
	}

	function load_catalogs() {
		return Promise.all([load_amenities(), load_categories(), load_bundle_limits()]);
	}

	// geometry is a JSON field: Frappe returns it as a string, but tolerate an already-parsed
	// object (and bad data) so the builder can never crash on load.
	function parse_geometry(g) {
		if (!g) return blank_design();
		if (typeof g === "object") return g;
		try {
			return JSON.parse(g);
		} catch (e) {
			return blank_design();
		}
	}

	function fetch_quotation() {
		return new Promise((resolve) => {
			frappe.model.clear_doc("Butler Quotation", target_name);
			frappe.model.with_doc("Butler Quotation", target_name, () => {
				let doc = frappe.get_doc("Butler Quotation", target_name);
				quotation.value = doc;
				design.value = parse_geometry(doc.geometry);
				order_type.value = doc.order_type || "Amenities";
				bundle_type.value = doc.bundle_type || null;
				active_floor_type.value = design.value.floors[0]?.floor_type ?? null;
				selected_ids.value = [];
				active_amenity.value = null;
				selected_categories.value = [];

				const finish = () =>
					load_catalogs().then(() =>
						nextTick(() => {
							dirty.value = false;
							resolve();
						})
					);

				if (doc.facility) {
					frappe.model.clear_doc("Facility", doc.facility);
					frappe.model.with_doc("Facility", doc.facility, () => {
						facility.value = frappe.get_doc("Facility", doc.facility);
						finish();
					});
				} else {
					facility.value = null;
					finish();
				}
			});
		});
	}

	function fetch_facility() {
		return new Promise((resolve) => {
			frappe.model.clear_doc("Facility", target_name);
			frappe.model.with_doc("Facility", target_name, () => {
				facility.value = frappe.get_doc("Facility", target_name);
				quotation.value = null;
				design.value = blank_design();
				// seed floor tabs from the facility's blueprint rows so blueprints reload (auto-fit)
				const seen = new Set();
				for (const row of facility.value.blueprints || []) {
					if (row.floor_type && !seen.has(row.floor_type)) {
						seen.add(row.floor_type);
						design.value.floors.push({ floor_type: row.floor_type, rooms: [] });
					}
				}
				order_type.value = "Amenities";
				bundle_type.value = null;
				active_floor_type.value = design.value.floors[0]?.floor_type ?? null;
				selected_ids.value = [];
				active_amenity.value = null;
				selected_categories.value = [];
				load_catalogs().then(() =>
					nextTick(() => {
						dirty.value = false;
						resolve();
					})
				);
			});
		});
	}

	function load_amenities() {
		return frappe.db
			.get_list("Amenity", {
				// only what the palette needs (name, label, category for colour, image);
				// pricing/flags are resolved server-side, never on the client
				fields: ["name", "amenity_name", "amenity_category", "image"],
				filters: [["disabled", "=", 0]],
				limit: 0,
			})
			.then((rows) => (amenities.value = rows));
	}

	function load_categories() {
		return frappe.db
			.get_list("Amenity Category", {
				fields: ["name", "category_name", "color", "image"],
				limit: 0,
			})
			.then((rows) => (categories.value = rows));
	}

	// limits come from the bundle's per-category allowance — the same server-side
	// source of truth the Butler Quotation uses (Amenity Category -> Bundles rows)
	function load_bundle_limits() {
		if (order_type.value !== "Bundle" || !bundle_type.value) {
			bundle_limits.value = {};
			return Promise.resolve();
		}
		return frappe
			.xcall("butler.butler.doctype.butler_bundle.butler_bundle.get_bundle_breakdown", {
				bundle: bundle_type.value,
			})
			.then((rows) => {
				const map = {};
				for (const r of rows || []) map[r.amenity_category] = r.amenity_count;
				bundle_limits.value = map;
			});
	}

	// --- order config (mirrors the quotation's own fields) ---
	function set_order_type(value) {
		order_type.value = value || "Amenities";
		if (order_type.value !== "Bundle") bundle_type.value = null;
		selected_categories.value = [];
		selected_amenity.value = null;
		dirty.value = true;
		load_bundle_limits();
	}

	function set_bundle_type(value) {
		bundle_type.value = value || null;
		selected_categories.value = [];
		selected_amenity.value = null;
		dirty.value = true;
		load_bundle_limits();
	}

	function set_selected_categories(list) {
		selected_categories.value = Array.isArray(list) ? list : [];
		selected_amenity.value = null; // narrowing categories resets the amenity filter
	}

	function set_selected_amenity(value) {
		selected_amenity.value = value || null;
	}

	// --- save ---
	// One amenity row per drawn placement, carrying the room's own id so the server can
	// tell which shape each row came from, and whatever features have been configured on
	// it. Pricing stays server-side — the builder says what is fitted, never what it costs.
	//
	// A room only carries `annexes` once someone has edited them; until then it sends no
	// annex rows and no `annexes_customised`, and the server seeds from the Amenity master
	// exactly as it does for a form or import row. That way an unvisited Features layer
	// can never empty a quotation, and `[]` still means "deliberately none".
	function build_amenity_rows() {
		const rows = [];
		for (const floor of design.value.floors) {
			for (const r of floor.rooms) {
				if (!r.amenity) continue;
				const customised = Array.isArray(r.annexes);
				rows.push({
					doctype: "Butler Quotation Item",
					placement_id: r.id,
					amenity: r.amenity,
					floor_type: floor.floor_type,
					amenity_qty: 1,
					light_system: r.light_system || null,
					has_sound_system: r.has_sound_system ? 1 : 0,
					annexes_customised: customised ? 1 : 0,
				});
				if (!customised) continue;
				for (const a of r.annexes) {
					rows.push({
						doctype: "Butler Quotation Item",
						placement_id: r.id,
						amenity: r.amenity,
						floor_type: floor.floor_type,
						annex: a.annex,
						// the panel refuses a non-positive quantity, so this only catches
						// hand-edited or otherwise corrupt geometry. 1 is the recoverable
						// choice: the row shows up and can be fixed, where sending 0 would
						// fail the save with a row number nobody can trace to a room.
						annex_quantity: flt(a.qty) || 1,
						annex_uom: a.uom,
					});
				}
			}
		}
		return rows;
	}
	// returns false (with a warning) if the order config is incomplete
	function validate_order() {
		if (order_type.value === "Bundle" && !bundle_type.value) {
			frappe.show_alert({ message: __("Select a Bundle first."), indicator: "orange" });
			return false;
		}
		return true;
	}

	// friendly guard so the cryptic server "Data missing in table Amenities" never shows
	function has_amenities() {
		if (placed_count.value >= 1) return true;
		frappe.msgprint({
			title: __("No amenities yet"),
			message: __("Place at least one amenity on the canvas before saving."),
			indicator: "orange",
		});
		return false;
	}

	// Every save path below returns a NATIVE promise, deliberately. `frappe.call` resolves
	// a jQuery Deferred, which has `.then` but no `.finally` — and Frappe's
	// `Page.btn_disable_enable` (page.js:596) tests for `.then` first and then calls
	// `.finally` on it. Handing it a Deferred throws "response.finally is not a function"
	// and leaves the Save button stuck disabled. `Promise.resolve` adopts the thenable and
	// gives Frappe the shape it already assumes it has.
	function save_changes() {
		return is_facility_mode ? create_quotation() : save_quotation();
	}

	function save_quotation() {
		if (read_only.value) {
			frappe.msgprint({
				title: __("Read only"),
				message: __("This quotation is {0} and cannot be edited.", [
					quotation.value?.docstatus === 2 ? __("Cancelled") : __("Submitted"),
				]),
				indicator: "orange",
			});
			return Promise.resolve();
		}
		if (!has_amenities()) return Promise.resolve();
		if (!validate_order()) return Promise.resolve();
		frappe.dom.freeze(__("Saving..."));
		quotation.value.geometry = JSON.stringify(design.value);
		quotation.value.order_type = order_type.value;
		quotation.value.bundle_type = order_type.value === "Bundle" ? bundle_type.value : null;
		quotation.value.amenities = build_amenity_rows();

		return Promise.resolve(
			frappe.call("frappe.client.save", { doc: quotation.value }).then(() => {
				frappe.show_alert({ message: __("Quotation saved."), indicator: "green" });
				return fetch();
			})
		).finally(() => frappe.dom.unfreeze());
	}

	// facility mode: a placed amenity spawns a brand-new draft Butler Quotation
	function create_quotation() {
		if (!has_amenities()) return Promise.resolve();
		if (!validate_order()) return Promise.resolve();
		frappe.dom.freeze(__("Creating quotation..."));
		const doc = {
			doctype: "Butler Quotation",
			naming_series: "BTLR-QTN-.YYYY.-",
			facility: facility.value.name,
			order_type: order_type.value,
			bundle_type: order_type.value === "Bundle" ? bundle_type.value : null,
			geometry: JSON.stringify(design.value),
			amenities: build_amenity_rows(),
		};
		return Promise.resolve(
			frappe.call("frappe.client.insert", { doc }).then((r) => {
				const name = r.message?.name;
				if (name) {
					frappe.show_alert({
						message: __("Quotation {0} created.", [name]),
						indicator: "green",
					});
					// switch the builder over to the new quotation
					frappe.set_route("facility-builder", "quotation", name);
				}
			})
		).finally(() => frappe.dom.unfreeze());
	}

	function reset_changes() {
		return fetch();
	}

	// save the FACILITY (blueprint SOURCE files live there, not on the quotation)
	function save_facility() {
		if (!facility.value) return Promise.resolve();
		frappe.dom.freeze(__("Saving blueprint..."));
		return Promise.resolve(
			frappe.call("frappe.client.save", { doc: facility.value }).then((r) => {
				if (r.message) facility.value = r.message;
			})
		).finally(() => frappe.dom.unfreeze());
	}

	// --- floor mutations ---
	function add_floor(floor_type) {
		if (read_only.value) return;
		if (!floor_type || design.value.floors.some((f) => f.floor_type === floor_type)) {
			active_floor_type.value = floor_type;
			return;
		}
		design.value.floors.push({ floor_type, rooms: [] });
		active_floor_type.value = floor_type;
	}

	function remove_floor(floor_type) {
		if (read_only.value) return;
		design.value.floors = design.value.floors.filter((f) => f.floor_type !== floor_type);
		if (active_floor_type.value === floor_type) {
			active_floor_type.value = design.value.floors[0]?.floor_type ?? null;
		}
	}

	// --- room mutations (rooms represent AMENITIES) ---
	// geometry defaults for a freshly placed shape (the active tool decides which)
	function tool_geometry(tool) {
		switch (tool) {
			case "ellipse":
				return { shape: "ellipse", rx: 60, ry: 50 };
			case "triangle":
				return { shape: "polygon", points: ngon_points(3, 120, 120) };
			case "pentagon":
				return { shape: "polygon", points: ngon_points(5, 120, 120) };
			case "hexagon":
				return { shape: "polygon", points: ngon_points(6, 120, 120) };
			case "line":
				return { shape: "line", points: [0, 0, 120, 0] };
			case "point":
				return {
					shape: "point",
					icon: point_style.value.icon,
					color: point_style.value.color,
					size: point_style.value.size || DEFAULT_POINT_SIZE,
				};
			default:
				return { shape: "rect", w: 120, h: 100 };
		}
	}

	// default styling applied to newly-dropped points (set from the Point tool controls)
	function set_point_defaults(patch) {
		point_style.value = { ...point_style.value, ...patch };
	}

	function add_room(partial) {
		if (read_only.value || !active_floor.value) return null;
		const amenity = partial.amenity;
		const info = amenity_index.value[amenity];
		const category = info?.amenity_category || partial.category || null;
		// enforce the bundle's per-category limit
		if (category && category_is_full(category)) {
			frappe.show_alert({
				message: __("The {0} category is full for this bundle.", [category]),
				indicator: "orange",
			});
			return null;
		}
		const shape = partial.shape || "rect";
		let room = {
			id: frappe.utils.get_random(8),
			amenity,
			category,
			shape,
			x: partial.x ?? 40,
			y: partial.y ?? 40,
			rotation: 0,
			area: 0,
			remarks: "",
		};
		if (shape === "ellipse") {
			room.rx = partial.rx ?? 60;
			room.ry = partial.ry ?? 50;
		} else if (shape === "polygon") {
			room.points = partial.points || rect_to_polygon_points(120, 100);
		} else if (shape === "line") {
			room.points = partial.points || [0, 0, 120, 0];
		} else if (shape === "point") {
			room.icon = partial.icon || null;
			room.color = partial.color || null;
			room.size = partial.size ?? DEFAULT_POINT_SIZE;
		} else {
			room.w = partial.w ?? 120;
			room.h = partial.h ?? 100;
		}
		room.area = room_area_m2(room, ppm.value);
		active_floor.value.rooms.push(room);
		select_only(room.id);
		return room;
	}

	// --- the palette picks the amenity; the canvas draws it ---
	function set_active_amenity(name) {
		active_amenity.value = name || null;
	}

	const N_SIDES = { triangle: 3, pentagon: 5, hexagon: 6 };

	// single click places a point with the current point style
	function draw_point(x, y) {
		if (read_only.value || !active_amenity.value) return;
		add_room({ amenity: active_amenity.value, x, y, ...tool_geometry("point") });
	}

	// click-drag shapes: create a seed at the start, resize during the drag, finalize on release
	function begin_draw(x, y) {
		if (read_only.value || !active_amenity.value || !active_floor.value) return;
		const tool = active_tool.value;
		let geom;
		if (tool === "ellipse") geom = { shape: "ellipse", rx: 1, ry: 1 };
		else if (N_SIDES[tool]) geom = { shape: "polygon", points: ngon_points(N_SIDES[tool], 2, 2) };
		else if (tool === "line") geom = { shape: "line", points: [0, 0, 0, 0] };
		else geom = { shape: "rect", w: 1, h: 1 };
		const room = add_room({ amenity: active_amenity.value, x, y, ...geom });
		if (!room) return;
		draw_id.value = room.id;
		_draw_origin = { x, y };
	}

	function update_draw(x, y) {
		const room = active_floor.value?.rooms.find((r) => r.id === draw_id.value);
		if (!room) return;
		if (room.shape === "line") {
			// a straight segment: anchored at the drag start, the 2nd point follows the cursor
			room.x = _draw_origin.x;
			room.y = _draw_origin.y;
			room.points = [0, 0, x - _draw_origin.x, y - _draw_origin.y];
			room.area = 0;
			return;
		}
		const left = Math.min(_draw_origin.x, x);
		const top = Math.min(_draw_origin.y, y);
		const w = Math.abs(x - _draw_origin.x);
		const h = Math.abs(y - _draw_origin.y);
		room.x = left;
		room.y = top;
		if (room.shape === "ellipse") {
			room.rx = Math.max(1, w / 2);
			room.ry = Math.max(1, h / 2);
		} else if (room.shape === "polygon") {
			room.points = ngon_points(N_SIDES[active_tool.value] || 4, Math.max(2, w), Math.max(2, h));
		} else {
			room.w = Math.max(1, w);
			room.h = Math.max(1, h);
		}
		room.area = room_area_m2(room, ppm.value);
	}

	function finish_draw() {
		const id = draw_id.value;
		draw_id.value = null;
		const room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room) return;
		const ext = shape_extent(room);
		// a click with no real drag → give it the tool's default size in place
		if (ext.w < 5 && ext.h < 5) {
			const cx = room.x;
			const cy = room.y;
			Object.assign(room, tool_geometry(active_tool.value));
			room.x = cx;
			room.y = cy;
		}
		room.area = room_area_m2(room, ppm.value);
	}

	function update_room(id, patch) {
		if (read_only.value) return;
		let room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room) return;
		Object.assign(room, patch);
		room.area = room_area_m2(room, ppm.value);
	}

	function delete_room(id) {
		if (read_only.value || !active_floor.value) return;
		active_floor.value.rooms = active_floor.value.rooms.filter((r) => r.id !== id);
		selected_ids.value = selected_ids.value.filter((x) => x !== id);
	}

	function set_point_style(id, patch) {
		update_room(id, patch); // { icon?, color?, size? }
	}

	// --- shape tools ---
	// select the active tool; if a room is selected, convert it to that shape.
	// Pick the active tool. If exactly one room is selected, convert it to that shape
	// (instant shapes only — pen needs a drawn outline, so it just becomes the draw tool).
	function set_active_tool(tool) {
		cancel_pen(); // abandon any in-progress freehand
		active_tool.value = tool;
		// select + pen aren't instant shapes, so they never convert the selected room
		if (tool === "select" || tool === "pen") return;
		const room = selected_room.value;
		if (room) convert_room_shape(room.id, tool);
	}

	// convert a room to another shape, preserving its size + (roughly) its position
	function convert_room_shape(id, tool) {
		if (read_only.value) return;
		const room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room) return;
		const ext = shape_extent(room);
		const w = Math.max(1, ext.w);
		const h = Math.max(1, ext.h);
		const wasPoint = room.shape === "point";
		const isPath = room.shape === "polygon" || room.shape === "line";
		const polyOffset = isPath ? room_bbox(room) : { x: 0, y: 0 };

		// normalise origin to the shape's top-left before rebuilding
		if (wasPoint) {
			room.x -= w / 2;
			room.y -= h / 2;
		} else if (isPath) {
			room.x += polyOffset.x;
			room.y += polyOffset.y;
		}
		delete room.points;
		delete room.rx;
		delete room.ry;
		delete room.w;
		delete room.h;
		delete room.icon;
		delete room.color;
		delete room.size;

		switch (tool) {
			case "ellipse":
				room.shape = "ellipse";
				room.rx = w / 2;
				room.ry = h / 2;
				break;
			case "triangle":
				room.shape = "polygon";
				room.points = ngon_points(3, w, h);
				break;
			case "pentagon":
				room.shape = "polygon";
				room.points = ngon_points(5, w, h);
				break;
			case "hexagon":
				room.shape = "polygon";
				room.points = ngon_points(6, w, h);
				break;
			case "line":
				room.shape = "line";
				room.points = [0, 0, w, 0]; // a horizontal segment spanning the old width
				break;
			case "point":
				room.shape = "point";
				room.size = DEFAULT_POINT_SIZE;
				room.icon = null;
				room.color = null;
				room.x += w / 2; // top-left → centre anchor
				room.y += h / 2;
				break;
			case "rect":
			default:
				room.shape = "rect";
				room.w = w;
				room.h = h;
				break;
		}
		room.area = room_area_m2(room, ppm.value);
	}

	// --- freehand pen (click to drop vertices; double-click or Enter to close) ---
	// We detect the double-click here by timing rather than relying on Konva's dblclick
	// event (which doesn't fire reliably on the empty stage): if a click lands within
	// ~350ms of the previous one, it's the 2nd click of a double-click → close the shape.
	let _last_pen_click = 0;
	let _last_pen_pos = { x: 0, y: 0 };
	const PEN_DBLCLICK_MS = 350;
	const PEN_DBLCLICK_PX = 6; // 2nd click must land on ~the same spot as the 1st

	function pen_click(x, y) {
		if (read_only.value || !active_amenity.value || !active_floor.value) return;
		const now = Date.now();
		if (!pen_room_id.value) {
			const room = add_room({ amenity: active_amenity.value, x, y, shape: "polygon", points: [0, 0] });
			if (room) pen_room_id.value = room.id;
			_last_pen_click = now;
			_last_pen_pos = { x, y };
			return;
		}
		const room = active_floor.value.rooms.find((r) => r.id === pen_room_id.value);
		if (!room) {
			pen_room_id.value = null;
			return;
		}
		// 2nd click of a double-click (same spot, quick) → close; the prior click placed the last vertex
		if (
			now - _last_pen_click < PEN_DBLCLICK_MS &&
			Math.hypot(x - _last_pen_pos.x, y - _last_pen_pos.y) < PEN_DBLCLICK_PX
		) {
			finish_pen();
			return;
		}
		_last_pen_click = now;
		_last_pen_pos = { x, y };
		room.points.push(x - room.x, y - room.y);
		room.area = room_area_m2(room, ppm.value);
	}

	function finish_pen() {
		const id = pen_room_id.value;
		pen_room_id.value = null;
		if (!id) return;
		const room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room) return;
		// drop a trailing duplicate vertex (e.g. the second click of a double-click finish)
		const p = room.points;
		if (
			p.length >= 4 &&
			Math.hypot(p[p.length - 2] - p[p.length - 4], p[p.length - 1] - p[p.length - 3]) < 3
		) {
			p.splice(p.length - 2, 2);
		}
		if (room.points.length / 2 < 3) {
			delete_room(id); // not enough vertices for a polygon
			return;
		}
		room.area = room_area_m2(room, ppm.value);
		select_only(id);
	}

	function cancel_pen() {
		const id = pen_room_id.value;
		pen_room_id.value = null;
		if (id) delete_room(id);
	}

	// --- copy / paste (Ctrl+C / Ctrl+V) ---
	function copy_selection() {
		const rooms = selected_rooms.value;
		if (!rooms.length) return;
		clipboard.value = rooms.map((r) => JSON.parse(JSON.stringify(r)));
	}

	function paste() {
		if (read_only.value || !active_floor.value || !clipboard.value.length) return;
		const ids = [];
		for (const snap of clipboard.value) {
			const info = amenity_index.value[snap.amenity];
			const category = info?.amenity_category || snap.category || null;
			if (category && category_is_full(category)) continue; // respect bundle caps
			const room = { ...JSON.parse(JSON.stringify(snap)), id: frappe.utils.get_random(8) };
			room.x = (room.x || 0) + 20; // offset so the copy is visible
			room.y = (room.y || 0) + 20;
			active_floor.value.rooms.push(room);
			ids.push(room.id);
		}
		if (ids.length) selected_ids.value = ids;
	}

	// --- object snapping (move only): snap a room's world-AABB edges to nearby rooms' edges ---
	function snap_room_position(id, x, y) {
		if (!snap_enabled.value) return { x, y };
		const room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room) return { x, y };
		// AABB extent RELATIVE to the origin (rotation-aware) — add the candidate origin below
		const rel = room_world_aabb({ ...room, x: 0, y: 0 });
		const threshold = 8;
		let nx = x;
		let ny = y;
		let bestDX = threshold;
		let bestDY = threshold;
		// moving edges in world coords for a candidate origin (x,y)
		const movX = [x + rel.x, x + rel.x + rel.w]; // left, right
		const movY = [y + rel.y, y + rel.y + rel.h]; // top, bottom
		for (const other of active_floor.value.rooms) {
			if (other.id === id) continue;
			const ob = room_world_aabb(other);
			const oX = [ob.x, ob.x + ob.w];
			const oY = [ob.y, ob.y + ob.h];
			for (const m of movX)
				for (const o of oX) {
					const d = Math.abs(m - o);
					if (d < bestDX) {
						bestDX = d;
						nx = x + (o - m);
					}
				}
			for (const m of movY)
				for (const o of oY) {
					const d = Math.abs(m - o);
					if (d < bestDY) {
						bestDY = d;
						ny = y + (o - m);
					}
				}
		}
		return { x: nx, y: ny };
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
		if (read_only.value) return;
		design.value.scale.pixels_per_meter = Math.max(1, Number(pixels_per_meter) || 50);
		recompute_all_areas();
	}

	function set_grid(grid) {
		if (read_only.value) return;
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
		if (read_only.value) return;
		design.value.canvas.snap = !snap_enabled.value;
	}

	function set_rooms_opacity(v) {
		design.value.canvas.rooms_opacity = Math.min(1, Math.max(0.1, Number(v) || 1));
	}

	// --- blueprint placement (per active floor, stored in geometry) ---
	// `silent` suppresses the dirty flip — used for the auto-fit on load, which is a
	// derived placement, not a user edit (so opening a doc never shows "Not Saved").
	function set_blueprint_transform(patch, { silent = false } = {}) {
		if (read_only.value || !active_floor.value) return;
		if (silent) suppress_dirty_once();
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

	// --- blueprint page (the SOURCE, stored on the FACILITY's child row) ---
	function set_blueprint_page(page) {
		if (read_only.value) return; // a submitted/cancelled quotation must not mutate the shared Facility
		const row = active_blueprint_row.value;
		if (!row) return;
		row.page = Math.max(1, Number(page) || 1);
		save_facility();
	}

	function clear_blueprint_placement() {
		if (active_floor.value) active_floor.value.blueprint = null;
	}

	function request_blueprint_fit() {
		blueprint_fit_nonce.value++;
	}

	function set_active_layer(layer) {
		active_layer.value = layer;
		// Drawing and Features both act on a selected room — one edits its shape, the
		// other its contents — so the selection carries between them. Blueprint has
		// nothing to do with rooms, so it drops it rather than leave a stale highlight.
		if (layer === "blueprint") clear_selection();
		if (layer !== "blueprint") calibrating.value = false;
		if (layer === "features") load_amenity_catalogue();
	}

	// What each placed amenity OFFERS: its annexes (with icons) and its light/sound
	// configuration. Two endpoints because they already exist and are used elsewhere —
	// get_amenity_annexes carries the icons the canvas draws, get_amenity_options the
	// light systems and sound price the panel edits. Both cached per amenity, so this
	// costs one pair of round trips per session however often the layer is opened.
	function load_amenity_catalogue() {
		const placed = new Set();
		for (const floor of design.value?.floors || []) {
			for (const room of floor.rooms || []) {
				if (room.amenity) placed.add(room.amenity);
			}
		}
		const annexes = [...placed].filter((a) => !(a in annexes_by_amenity.value));
		const options = [...placed].filter((a) => !(a in amenity_options.value));

		return Promise.all([
			annexes.length
				? frappe
						.xcall("butler.butler.doctype.amenity.amenity.get_amenity_annexes", {
							amenities: annexes,
						})
						.then((r) => {
							annexes_by_amenity.value = { ...annexes_by_amenity.value, ...(r || {}) };
						})
				: Promise.resolve(),
			options.length
				? frappe
						.xcall(
							"butler.butler.doctype.butler_quotation.butler_quotation.get_amenity_options",
							{ amenities: options }
						)
						.then((r) => {
							amenity_options.value = { ...amenity_options.value, ...(r || {}) };
						})
				: Promise.resolve(),
		]);
	}

	// [] rather than undefined for an amenity we haven't loaded yet, so callers can render
	// without guarding — the icons appear when the fetch lands.
	function annexes_for(amenity) {
		return annexes_by_amenity.value[amenity] || [];
	}

	function options_for(amenity) {
		return amenity_options.value[amenity] || {};
	}

	// What this placement actually has. A room carries `annexes` only once edited;
	// until then it inherits the Amenity's own composition — which is also what the
	// server would seed. `[]` is a real answer (every annex removed), `undefined` is not.
	function effective_annexes(room) {
		if (Array.isArray(room?.annexes)) return room.annexes;
		return annexes_for(room?.amenity).map((a) => ({
			annex: a.annex,
			qty: flt(a.qty) || 1,
			uom: a.uom,
		}));
	}

	// --- per-placement features (Features layer) ---
	// Thin named wrappers over update_room, the way set_point_style is, so the rule that
	// editing materialises the inherited list lives here rather than in the component.
	function set_room_features(id, patch) {
		update_room(id, patch); // { annexes?, light_system?, has_sound_system? }
	}

	function set_room_annexes(id, list) {
		update_room(id, { annexes: list });
	}

	function add_room_annex(id, annex) {
		const room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room || !annex) return;
		const list = effective_annexes(room).slice();
		if (list.some((a) => a.annex === annex)) return; // one line per annex
		const source = annexes_for(room.amenity).find((a) => a.annex === annex) || {};
		list.push({ annex, qty: flt(source.qty) || 1, uom: source.uom });
		set_room_annexes(id, list);
	}

	// An amenity is what it is composed of — the Amenity master makes `annexes` mandatory,
	// and the server refuses a placement with none. Refuse the last one here too, so the
	// rule is felt where the action is rather than as a throw on save.
	function remove_room_annex(id, annex) {
		const room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room) return false;
		const rest = effective_annexes(room).filter((a) => a.annex !== annex);
		if (!rest.length) return false;
		set_room_annexes(id, rest);
		return true;
	}

	function set_room_annex(id, annex, patch) {
		const room = active_floor.value?.rooms.find((r) => r.id === id);
		if (!room) return;
		set_room_annexes(
			id,
			effective_annexes(room).map((a) => (a.annex === annex ? { ...a, ...patch } : a))
		);
	}

	// Back to whatever the Amenity says — drops the override rather than copying the
	// master in, so a later change to the Amenity flows through again.
	function reset_room_features(id) {
		update_room(id, { annexes: undefined, light_system: null, has_sound_system: 0 });
	}

	function has_custom_features(room) {
		return Boolean(
			Array.isArray(room?.annexes) || room?.light_system || room?.has_sound_system
		);
	}

	// Copy one placement's features onto every other placement of the same amenity, on
	// every floor. Without consolidation this is the difference between 1 edit and 20.
	function apply_features_to_similar(id) {
		const source = active_floor.value?.rooms.find((r) => r.id === id);
		if (!source || read_only.value) return 0;
		const features = {
			annexes: Array.isArray(source.annexes)
				? source.annexes.map((a) => ({ ...a }))
				: undefined,
			light_system: source.light_system || null,
			has_sound_system: source.has_sound_system ? 1 : 0,
		};
		let touched = 0;
		for (const floor of design.value?.floors || []) {
			for (const room of floor.rooms || []) {
				if (room.id === id || room.amenity !== source.amenity) continue;
				Object.assign(room, {
					...features,
					annexes: features.annexes ? features.annexes.map((a) => ({ ...a })) : undefined,
				});
				touched++;
			}
		}
		return touched;
	}

	function start_calibration() {
		calibrating.value = true;
	}

	function cancel_calibration() {
		calibrating.value = false;
	}

	// upload: set/replace the blueprint FILE row for the active floor on the FACILITY, persist immediately
	function set_blueprint_file(file_url) {
		if (read_only.value || !active_floor_type.value || !facility.value) return Promise.resolve();
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
		return save_facility();
	}

	// --- dirty tracking ---
	// A guarded deep watch: programmatic, derived mutations (e.g. blueprint auto-fit on
	// load) can suppress the flip for one flush so they don't mark the doc unsaved.
	let _suppress_dirty = false;
	function suppress_dirty_once() {
		_suppress_dirty = true;
		nextTick(() => (_suppress_dirty = false)); // reset after the watcher has flushed
	}
	watch(
		design,
		() => {
			if (_suppress_dirty) return;
			dirty.value = true;
		},
		{ deep: true }
	);

	return {
		mode,
		is_facility_mode,
		quotation,
		facility,
		design,
		amenities,
		categories,
		bundle_limits,
		order_type,
		bundle_type,
		selected_categories,
		selected_amenity,
		active_tool,
		active_amenity,
		pen_room_id,
		draw_id,
		clipboard,
		point_style,
		active_floor_type,
		active_floor,
		selected_ids,
		selected_room,
		selected_rooms,
		is_selected,
		select_only,
		toggle_select,
		select_all,
		clear_selection,
		select_within,
		category_colors,
		amenity_index,
		available_categories,
		allowed_category_names,
		category_filtered_amenities,
		filtered_amenities,
		placed_count,
		category_counts,
		category_is_full,
		read_only,
		snap_enabled,
		rooms_opacity,
		view_scale,
		zoom_api,
		active_blueprint_row,
		active_blueprint_url,
		active_blueprint_page,
		active_blueprint,
		active_layer,
		annexes_by_amenity,
		annexes_for,
		amenity_options,
		options_for,
		show_annex_icons,
		effective_annexes,
		has_custom_features,
		calibrating,
		blueprint_fit_nonce,
		blueprint_page_count,
		ppm,
		dirty,
		fetch,
		save_changes,
		reset_changes,
		set_order_type,
		set_bundle_type,
		set_selected_categories,
		set_selected_amenity,
		set_active_amenity,
		add_floor,
		remove_floor,
		add_room,
		update_room,
		delete_room,
		draw_point,
		begin_draw,
		update_draw,
		finish_draw,
		pen_click,
		finish_pen,
		cancel_pen,
		copy_selection,
		paste,
		snap_room_position,
		set_point_style,
		set_point_defaults,
		set_active_tool,
		convert_room_shape,
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
		load_amenity_catalogue,
		set_room_features,
		set_room_annexes,
		add_room_annex,
		remove_room_annex,
		set_room_annex,
		reset_room_features,
		apply_features_to_similar,
		set_blueprint_file,
		start_calibration,
		cancel_calibration,
	};
}

export function useStore() {
	let store = ref(inject("$store"));
	return { store };
}
