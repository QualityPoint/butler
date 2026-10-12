// Deterministic pastel color per name (an Amenity Category), so the same category
// always renders with the same fill across the palette and canvas when it has no
// explicit color set. Used as the fallback in resolveColor below.
const PALETTE = [
	"#bcd0f7",
	"#bce3c5",
	"#f7d9bc",
	"#e3bcf7",
	"#bcf2f7",
	"#f7bcd0",
	"#e7f7bc",
	"#c5c5f7",
	"#f7f0bc",
	"#bcf7e0",
];

// An extra annex (fitted from outside its Amenity's own list) is drawn in gold, on the
// plan and in the Features panel, so it stands out wherever it is. Dark enough to read
// as a stroke on a pastel room and on the panel in either theme.
export const EXTRA_ANNEX_COLOR = "#b8860b";

export function colorFor(name) {
	let hash = 0;
	for (let i = 0; i < (name || "").length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	}
	return PALETTE[hash % PALETTE.length];
}

// Prefer the chosen color for `key` (e.g. an Amenity Category); fall back to the
// deterministic name-hash palette.
export function resolveColor(key, colorMap) {
	return (colorMap && colorMap[key]) || colorFor(key);
}

// A darker version of a color, for drawing on top of it — the annex icons inside a room
// are stroked in the room's own color darkened, so they read as part of that amenity
// instead of as generic black marks on it.
export function darken(hex, amount = 0.55) {
	const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(hex || "").trim());
	if (!m) return hex;
	const full =
		m[1].length === 3
			? m[1]
					.split("")
					.map((c) => c + c)
					.join("")
			: m[1];
	const n = parseInt(full, 16);
	const scale = (c) => Math.round(c * (1 - amount));
	const r = scale((n >> 16) & 255);
	const g = scale((n >> 8) & 255);
	const b = scale(n & 255);
	return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
