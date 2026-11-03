export type PngWriter = (png: Blob) => Promise<void>;
export type PngEncoder = (image: Blob) => Promise<Blob>;

export async function writePngToClipboard(png: Blob): Promise<void> {
	await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

async function canvasToPng(blob: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(blob);
	try {
		const canvas = document.createElement("canvas");
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("No 2d canvas context");
		context.drawImage(bitmap, 0, 0);
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(png) => (png ? resolve(png) : reject(new Error("PNG encode failed"))),
				"image/png",
			);
		});
	} finally {
		bitmap.close();
	}
}

/** The clipboard takes only PNG for images, so any other format is re-encoded. */
export async function copyImageToClipboard(
	src: string,
	write: PngWriter = writePngToClipboard,
	toPng: PngEncoder = canvasToPng,
): Promise<void> {
	const blob = await (await fetch(src)).blob();
	await write(blob.type === "image/png" ? blob : await toPng(blob));
}
