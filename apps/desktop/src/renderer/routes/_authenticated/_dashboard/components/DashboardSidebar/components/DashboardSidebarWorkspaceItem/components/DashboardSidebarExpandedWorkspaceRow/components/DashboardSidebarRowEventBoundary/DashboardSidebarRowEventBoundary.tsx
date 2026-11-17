import type { ReactNode, SyntheticEvent } from "react";

function stopRowEvent(event: SyntheticEvent) {
	event.stopPropagation();
}

interface DashboardSidebarRowEventBoundaryProps {
	children: ReactNode;
}

/**
 * Keeps a control inside a workspace row, and any portaled content it opens,
 * from starting a row drag or activating the row.
 */
export function DashboardSidebarRowEventBoundary({
	children,
}: DashboardSidebarRowEventBoundaryProps) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: only stops propagation; the children are the interactive elements
		<span
			className="flex shrink-0"
			onMouseDown={stopRowEvent}
			onTouchStart={stopRowEvent}
			onClick={stopRowEvent}
			onDoubleClick={stopRowEvent}
			onKeyDown={stopRowEvent}
		>
			{children}
		</span>
	);
}
