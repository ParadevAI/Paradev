import type { ReactNode } from "react";

interface PaneSectionProps {
	title: ReactNode;
	/** A count or state after the title. */
	meta?: ReactNode;
	/** A control at the row's end: Add, Edit, a menu. */
	action?: ReactNode;
	children: ReactNode;
}

/** A labelled group in the pane: a small caps title, then its rows. */
export function PaneSection({
	title,
	meta,
	action,
	children,
}: PaneSectionProps) {
	return (
		<section className="flex flex-col gap-1">
			<div className="flex h-7 items-center gap-1.5 px-2">
				<span className="text-[10px] font-semibold tracking-[0.075em] text-muted-foreground uppercase">
					{title}
				</span>
				{meta !== undefined && (
					<span className="text-[10px] text-muted-foreground tabular-nums">
						{meta}
					</span>
				)}
				<div className="min-w-0 flex-1" />
				{action}
			</div>
			<div className="flex flex-col gap-px">{children}</div>
		</section>
	);
}
