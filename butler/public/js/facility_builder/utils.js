// Pure helpers for the Facility Builder canvas + persistence.

export const SCHEMA_VERSION = 1;

// A fresh, empty design envelope for a facility that has never been built.
export function blank_design() {
	return {
		version: SCHEMA_VERSION,
		scale: { pixels_per_meter: 50 },
		canvas: { width: 1200, height: 800, grid: 20 },
		floors: [],
	};
}

// Snap a value to the canvas grid.
export function snap(value, grid) {
	return Math.round(value / grid) * grid;
}

// Rectangle area in m² given pixel dimensions and pixels-per-meter.
export function rect_area_m2(w, h, ppm) {
	return (Math.abs(w) * Math.abs(h)) / (ppm * ppm);
}

// Polygon area in m² (shoelace) given a flat [x0,y0,x1,y1,...] point list.
export function polygon_area_m2(points, ppm) {
	let a = 0;
	for (let i = 0; i < points.length; i += 2) {
		const x1 = points[i];
		const y1 = points[i + 1];
		const x2 = points[(i + 2) % points.length];
		const y2 = points[(i + 3) % points.length];
		a += x1 * y2 - x2 * y1;
	}
	return Math.abs(a / 2) / (ppm * ppm);
}

// Area for any room shape, in m².
export function room_area_m2(room, ppm) {
	if (room.shape === "polygon") {
		return polygon_area_m2(room.points || [], ppm);
	}
	return rect_area_m2(room.w, room.h, ppm);
}

// Corner points (relative to the room origin) for a rectangle → polygon conversion.
export function rect_to_polygon_points(w, h) {
	return [0, 0, w, 0, w, h, 0, h];
}

// Local-space bounding box of a room: { x, y, w, h } relative to the room origin.
export function room_bbox(room) {
	if (room.shape === "polygon") {
		const pts = room.points || [];
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (let i = 0; i < pts.length; i += 2) {
			minX = Math.min(minX, pts[i]);
			maxX = Math.max(maxX, pts[i]);
			minY = Math.min(minY, pts[i + 1]);
			maxY = Math.max(maxY, pts[i + 1]);
		}
		if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
		return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
	}
	return { x: 0, y: 0, w: room.w, h: room.h };
}

// Distance from point (px,py) to segment (ax,ay)-(bx,by).
export function dist_to_segment(px, py, ax, ay, bx, by) {
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
	t = Math.max(0, Math.min(1, t));
	const cx = ax + t * dx;
	const cy = ay + t * dy;
	return Math.hypot(px - cx, py - cy);
}
