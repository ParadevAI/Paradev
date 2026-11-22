import { useCallback } from "react";
import { setHeaderSlot } from "../../utils/headerSlots";

interface DiffPaneHeaderSlotProps {
	id: string;
	className?: string;
}

/**
 * An empty spot in the pane header that the DiffPane fills through a portal,
 * so its header controls share the pane's own state.
 */
export function DiffPaneHeaderSlot({ id, className }: DiffPaneHeaderSlotProps) {
	const ref = useCallback(
		(element: HTMLDivElement | null) => setHeaderSlot(id, element),
		[id],
	);
	return <div ref={ref} className={className} />;
}
