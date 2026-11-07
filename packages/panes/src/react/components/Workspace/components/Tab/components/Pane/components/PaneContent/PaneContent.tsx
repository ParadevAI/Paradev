import type { ReactNode } from "react";

interface PaneContentProps {
	render: () => ReactNode;
	aside?: ReactNode;
	insetsAside?: boolean;
	/** Fades the content, for a pane that is not the focused one in a split. */
	dimmed?: boolean;
}

export function PaneContent({
	render,
	aside,
	insetsAside,
	dimmed = false,
}: PaneContentProps) {
	return (
		<div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
			<div
				className={`flex min-h-0 min-w-0 flex-1 overflow-hidden transition-opacity duration-150 ${
					insetsAside ? "" : "pr-[var(--pane-aside-inset,0px)]"
				} ${dimmed ? "opacity-70" : ""}`}
			>
				{render()}
			</div>
			{aside}
		</div>
	);
}
