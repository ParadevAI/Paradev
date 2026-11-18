export const PREFERRED_CENTER_WIDTH = 320;

export function clampSideWidth({
	width,
	minWidth,
	maxWidth,
	containerWidth,
}: {
	width: number;
	minWidth: number;
	maxWidth: number;
	containerWidth: number;
}): { width: number; maxWidth: number } {
	const max = Math.max(
		minWidth,
		Math.min(maxWidth, containerWidth - PREFERRED_CENTER_WIDTH),
	);
	return { width: Math.max(minWidth, Math.min(width, max)), maxWidth: max };
}
