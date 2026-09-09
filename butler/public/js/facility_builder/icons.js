// Render a Frappe icon (from the in-page SVG sprite) into an <img> that Konva can draw.
//
// Frappe injects its icon set as <symbol id="icon-NAME"> elements. A Konva.Image needs a
// standalone bitmap/SVG source, so we inline the symbol's contents into a self-contained
// <svg> and load it as a data-URL Image. Results are cached by (name + paint).
//
// **The paint has to be supplied.** These are Lucide symbols: bare <path>/<rect> elements
// carrying no fill or stroke of their own, drawn by the CSS on Frappe's root sprite
// (`.icon` — `fill: transparent; stroke: var(--icon-stroke); stroke-width: 1.5`). A
// detached <svg> in an <img> has no CSS context to inherit that from, and SVG's own
// initial values are `fill: black; stroke: none` — so leaving it alone does not preserve
// the icon, it turns every outline glyph into a solid black blob.
//
// Hence two modes:
//   outline: true   — Frappe's own rendering, a thin stroke and no fill. What an outline
//                     icon is meant to look like; annexes use it.
//   outline: false  — a solid glyph in one colour. The Point marker uses it, where the
//                     colour belongs to the marker rather than to the icon.

const cache = new Map();

export function load_icon_image(name, { color, outline = false } = {}) {
	if (!name) return Promise.resolve(null);
	const paint = color || "#1f272e";
	const key = `${name}|${paint}|${outline ? "outline" : "solid"}`;
	if (cache.has(key)) return cache.get(key);

	const promise = new Promise((resolve) => {
		const symbol = document.getElementById("icon-" + name);
		if (!symbol) {
			resolve(null);
			return;
		}
		const viewBox = symbol.getAttribute("viewBox") || "0 0 24 24";
		// a symbol that does declare currentColor still has nothing to resolve it against
		const inner = symbol.innerHTML.replace(/currentColor/g, paint);
		const attrs = outline
			? `fill="none" stroke="${paint}" stroke-width="1.5" ` +
				`stroke-linecap="round" stroke-linejoin="round"`
			: `fill="${paint}" stroke="${paint}"`;
		const svg =
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ` +
			`width="128" height="128" ${attrs}>${inner}</svg>`;
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
	});

	cache.set(key, promise);
	return promise;
}
