export type Box = { left: number; top: number; right: number; bottom: number };

const GAP_PX = 8;
const INSET_PX = 8;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), Math.max(min, max));
}

export function intersectBoxes(a: Box, b: Box): Box {
	return {
		left: Math.max(a.left, b.left),
		top: Math.max(a.top, b.top),
		right: Math.min(a.right, b.right),
		bottom: Math.min(a.bottom, b.bottom),
	};
}

/**
 * Centres the toolbar over the selection's last line, below it only when
 * below has more room, and keeps it 8px inside `bounds`.
 */
export function selectionToolbarLayout({
	anchor,
	size,
	bounds,
}: {
	anchor: Box;
	size: { width: number; height: number };
	bounds: Box;
}): { left: number; top: number; placement: "above" | "below" } {
	const above = anchor.top - GAP_PX - size.height;
	const below = anchor.bottom + GAP_PX;
	const roomAbove = above - (bounds.top + INSET_PX);
	const roomBelow = bounds.bottom - INSET_PX - (below + size.height);
	const placement =
		roomAbove >= 0 || roomAbove >= roomBelow ? "above" : "below";
	return {
		left: Math.round(
			clamp(
				(anchor.left + anchor.right - size.width) / 2,
				bounds.left + INSET_PX,
				bounds.right - INSET_PX - size.width,
			),
		),
		top: Math.round(
			clamp(
				placement === "above" ? above : below,
				bounds.top + INSET_PX,
				bounds.bottom - INSET_PX - size.height,
			),
		),
		placement,
	};
}
