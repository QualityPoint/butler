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

	const promise = find_symbol(name).then((symbol) => {
		if (!symbol) return null;
		return draw(symbol, paint, outline);
	});

	cache.set(key, promise);
	// Never let a failure stick. Concurrent callers still share the promise while it is in
	// flight, but a null result is dropped so the next render asks again instead of being
	// served a cached miss for the rest of the session.
	promise.then((image) => {
		if (!image) cache.delete(key);
	});
	return promise;
}

// Frappe injects its icon sprite with `fetch(...).then(svg => insertAdjacentHTML(...))`
// (jinja_globals.include_icons), so during boot "not found" means "not yet". Wait for it
// rather than resolving to null — bounded, so a genuinely unknown icon name still settles
// on the lettered fallback quickly instead of hanging.
function find_symbol(name, timeout = 3000, interval = 50) {
	const get = () => document.getElementById("icon-" + name);
	const found = get();
	if (found) return Promise.resolve(found);

	return new Promise((resolve) => {
		const deadline = Date.now() + timeout;
		const tick = () => {
			const symbol = get();
			if (symbol || Date.now() >= deadline) resolve(symbol || null);
			else setTimeout(tick, interval);
		};
		setTimeout(tick, interval);
	});
}

function draw(symbol, paint, outline) {
	return new Promise((resolve) => {
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
}
