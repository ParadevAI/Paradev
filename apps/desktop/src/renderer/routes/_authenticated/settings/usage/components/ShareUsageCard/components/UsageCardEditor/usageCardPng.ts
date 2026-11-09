import { type UsageCard, usageCardDataUrl } from "@superset/shared/usage-card";

export async function usageCardPng(card: UsageCard): Promise<Blob> {
	const image = new Image();
	image.src = usageCardDataUrl(card);
	await image.decode();
	const canvas = document.createElement("canvas");
	canvas.width = 1200;
	canvas.height = 900;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas unavailable");
	context.drawImage(image, 0, 0);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Image unavailable"))),
			"image/png",
		),
	);
}
