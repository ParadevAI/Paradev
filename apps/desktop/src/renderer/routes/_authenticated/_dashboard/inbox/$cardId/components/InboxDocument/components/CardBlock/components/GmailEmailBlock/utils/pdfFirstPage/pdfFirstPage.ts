const pages = new Map<string, Promise<string | null>>();

/** The PDF's first page drawn to an image, as Gmail's attachment preview shows it; null when it can't be read. */
export function pdfFirstPage(
	url: string,
	width: number,
): Promise<string | null> {
	const key = `${url}#${width}`;
	const cached = pages.get(key);
	if (cached) return cached;
	const page = render(url, width).catch(() => null);
	pages.set(key, page);
	return page;
}

async function render(url: string, width: number): Promise<string | null> {
	const [pdfjs, worker] = await Promise.all([
		import("pdfjs-dist"),
		import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
	]);
	pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
	const response = await fetch(url);
	if (!response.ok) return null;
	const document = await pdfjs.getDocument({
		data: new Uint8Array(await response.arrayBuffer()),
	}).promise;
	try {
		const first = await document.getPage(1);
		const base = first.getViewport({ scale: 1 });
		const viewport = first.getViewport({ scale: width / base.width });
		const canvas = window.document.createElement("canvas");
		canvas.width = Math.round(viewport.width);
		canvas.height = Math.round(viewport.height);
		const context = canvas.getContext("2d");
		if (!context) return null;
		await first.render({ canvas, canvasContext: context, viewport }).promise;
		return canvas.toDataURL("image/png");
	} finally {
		await document.destroy();
	}
}
