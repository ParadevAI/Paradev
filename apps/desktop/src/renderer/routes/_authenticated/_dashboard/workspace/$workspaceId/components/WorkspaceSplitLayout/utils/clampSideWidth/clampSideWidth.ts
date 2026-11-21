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
	const max = Math.min(
		maxWidth,
		Math.max(containerWidth / 2, containerWidth - PREFERRED_CENTER_WIDTH, 0),
	);
	const min = Math.min(minWidth, max);
	return { width: Math.max(min, Math.min(width, max)), maxWidth: max };
}
