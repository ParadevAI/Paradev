export const PREVIEW_ZOOM_STEPS = [0.5, 0.75, 1, 1.5] as const;

export type PreviewZoomStep = (typeof PREVIEW_ZOOM_STEPS)[number];
export type PreviewZoom = "fit" | PreviewZoomStep;

/** Fit shrinks a page that is wider than its frame and never enlarges one. */
export function previewScale(
	zoom: PreviewZoom,
	frameWidth: number,
	pageWidth: number | null,
): number {
	if (zoom !== "fit") return zoom;
	if (!pageWidth || frameWidth <= 0) return 1;
	return Math.min(1, frameWidth / pageWidth);
}
