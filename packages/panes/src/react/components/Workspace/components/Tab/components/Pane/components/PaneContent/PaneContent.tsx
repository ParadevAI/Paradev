import type { ReactNode } from "react";

interface PaneContentProps {
	render: () => ReactNode;
	aside?: ReactNode;
	insetsAside?: boolean;
}

export function PaneContent({ render, aside, insetsAside }: PaneContentProps) {
	return (
		<div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
			<div
				className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${
					insetsAside ? "" : "pr-[var(--pane-aside-inset,0px)]"
				}`}
			>
				{render()}
			</div>
			{aside}
		</div>
	);
}
