// Loads a blueprint attachment into something Konva can draw:
//   - image files  → an <img>
//   - PDF files    → page rendered to an offscreen <canvas> (via PDF.js)
//   - CAD files    → rejected with a helpful message (not web-renderable)
// v3 "legacy" build — transpiled below es2017 so Frappe's esbuild can bundle it
// (the modern build uses for-await/import.meta which es2017 can't transform).
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

// the worker is shipped as a static asset (must match the installed pdfjs version)
pdfjsLib.GlobalWorkerOptions.workerSrc =
	"/assets/butler/js/facility_builder/pdf.worker.min.js";

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"];
const CAD_EXT = ["dwg", "dxf", "dgn", "dwf"];

export function blueprint_kind(url) {
	const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
	if (ext === "pdf") return "pdf";
	if (CAD_EXT.includes(ext)) return "cad";
	if (IMAGE_EXT.includes(ext)) return "image";
	return "image"; // unknown → try as an image
}

// Resolve a blueprint URL to { image, width, height, pageCount }.
// `image` is an <img> or <canvas>, both valid Konva.Image sources.
export function load_blueprint(url, { page = 1, renderScale = 2 } = {}) {
	const kind = blueprint_kind(url);
	if (kind === "cad") {
		return Promise.reject(
			new Error(
				__("CAD files can't be displayed on the canvas. Export the blueprint to PDF or an image to trace over it.")
			)
		);
	}
	if (kind === "pdf") return load_pdf_page(url, page, renderScale);
	return load_image(url);
}

function load_image(url) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () =>
			resolve({ image: img, width: img.naturalWidth, height: img.naturalHeight, pageCount: 1 });
		img.onerror = () => reject(new Error(__("Could not load blueprint image.")));
		img.src = url;
	});
}

async function load_pdf_page(url, pageNum, renderScale) {
	const pdf = await pdfjsLib.getDocument(url).promise;
	const clamped = Math.min(Math.max(1, pageNum), pdf.numPages);
	const page = await pdf.getPage(clamped);
	const viewport = page.getViewport({ scale: renderScale });
	const canvas = document.createElement("canvas");
	canvas.width = Math.ceil(viewport.width);
	canvas.height = Math.ceil(viewport.height);
	await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
	return { image: canvas, width: canvas.width, height: canvas.height, pageCount: pdf.numPages };
}
