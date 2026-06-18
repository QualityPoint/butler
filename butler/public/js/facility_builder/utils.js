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

// Ellipse area in m² given pixel radii and pixels-per-meter.
export function ellipse_area_m2(rx, ry, ppm) {
	return (Math.PI * Math.abs(rx) * Math.abs(ry)) / (ppm * ppm);
}

// Area for any room shape, in m².
export function room_area_m2(room, ppm) {
	if (room.shape === "point") return 0; // markers have no area
	if (room.shape === "ellipse") return ellipse_area_m2(room.rx, room.ry, ppm);
	if (room.shape === "polygon") return polygon_area_m2(room.points || [], ppm);
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
	if (room.shape === "ellipse") {
		return { x: 0, y: 0, w: 2 * room.rx, h: 2 * room.ry };
	}
	if (room.shape === "point") {
		const s = room.size || 24;
		return { x: -s / 2, y: -s / 2, w: s, h: s }; // anchored at its centre
	}
	return { x: 0, y: 0, w: room.w, h: room.h };
}

// Width/height extent of any shape (used when converting between shapes).
export function shape_extent(room) {
	if (room.shape === "ellipse") return { w: 2 * room.rx, h: 2 * room.ry };
	if (room.shape === "point") return { w: room.size || 24, h: room.size || 24 };
	if (room.shape === "polygon") {
		const b = room_bbox(room);
		return { w: b.w, h: b.h };
	}
	return { w: room.w, h: room.h };
}

// Regular-polygon points (flat list) fitted into a w×h box, centred, first vertex up.
export function ngon_points(sides, w, h) {
	const cx = w / 2;
	const cy = h / 2;
	const rx = w / 2;
	const ry = h / 2;
	const out = [];
	for (let i = 0; i < sides; i++) {
		const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
		out.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
	}
	return out;
}

// Approximate an ellipse (rx, ry, origin top-left) as a polygon point list.
export function ellipse_to_polygon(rx, ry, segments = 24) {
	const out = [];
	for (let i = 0; i < segments; i++) {
		const a = (i * 2 * Math.PI) / segments;
		out.push(rx + rx * Math.cos(a), ry + ry * Math.sin(a));
	}
	return out;
}

// Ramer–Douglas–Peucker simplification of a flat [x0,y0,...] freehand stroke.
export function rdp(points, epsilon = 2) {
	const pts = [];
	for (let i = 0; i < points.length; i += 2) pts.push({ x: points[i], y: points[i + 1] });
	if (pts.length < 3) return points.slice();

	function simplify(start, end) {
		let maxD = 0;
		let idx = -1;
		const a = pts[start];
		const b = pts[end];
		for (let i = start + 1; i < end; i++) {
			const d = dist_to_segment(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y);
			if (d > maxD) {
				maxD = d;
				idx = i;
			}
		}
		if (maxD > epsilon && idx !== -1) {
			return [...simplify(start, idx), ...simplify(idx, end).slice(1)];
		}
		return [a, b];
	}

	const kept = simplify(0, pts.length - 1);
	const flat = [];
	for (const p of kept) flat.push(p.x, p.y);
	return flat;
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
