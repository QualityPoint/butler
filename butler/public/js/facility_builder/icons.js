// Render a Frappe icon (from the in-page SVG sprite) into an <img> that Konva can draw.
//
// Frappe injects its icon set as <symbol id="icon-NAME"> elements. A Konva.Image
// needs a standalone bitmap/SVG source, so we inline the symbol's contents into a
// self-contained <svg>, tint it, and load it as a data-URL Image. Results are cached
// by (name + color) so repeated renders are cheap.

const cache = new Map();

export function load_icon_image(name, color) {
	if (!name) return Promise.resolve(null);
	const tint = color || "#1f272e";
	const key = name + "|" + tint;
	if (cache.has(key)) return cache.get(key);

	const promise = new Promise((resolve) => {
		const symbol = document.getElementById("icon-" + name);
		if (!symbol) {
			resolve(null);
			return;
		}
		const viewBox = symbol.getAttribute("viewBox") || "0 0 24 24";
		// inline the symbol body, swapping currentColor for the chosen tint
		const inner = symbol.innerHTML.replace(/currentColor/g, tint);
		const svg =
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ` +
			`width="128" height="128" fill="${tint}" stroke="${tint}">${inner}</svg>`;
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
	});

	cache.set(key, promise);
	return promise;
}
