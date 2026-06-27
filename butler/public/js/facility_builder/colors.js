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
