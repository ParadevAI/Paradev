import type { Modifier } from "@dnd-kit/core";

/**
 * Keeps the drag preview just below-right of the pointer instead of where the
 * dragged row started, which for a full-width table row can be far away.
 */
export const snapToCursor: Modifier = ({
	activatorEvent,
	draggingNodeRect,
	transform,
}) => {
	if (!activatorEvent || !draggingNodeRect || !("clientX" in activatorEvent)) {
		return transform;
	}
	const pointer = activatorEvent as MouseEvent;
	return {
		...transform,
		x: transform.x + pointer.clientX - draggingNodeRect.left + 12,
		y: transform.y + pointer.clientY - draggingNodeRect.top + 8,
	};
};
