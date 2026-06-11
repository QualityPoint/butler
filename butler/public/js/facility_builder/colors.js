// Deterministic pastel color per Space Type name, so the same space type
// always renders with the same fill across the palette and canvas.
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

export function colorFor(name) {
	let hash = 0;
	for (let i = 0; i < (name || "").length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	}
	return PALETTE[hash % PALETTE.length];
}

// Prefer the Space Type's chosen color; fall back to the deterministic palette.
export function resolveColor(space_type, colorMap) {
	return (colorMap && colorMap[space_type]) || colorFor(space_type);
}
