import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

/** The one space between any two rail stops: headings, commits, reviews, comments. */
export const TIMELINE_GAP_CLASS_NAME = "pb-3";

interface PullRequestTimelineStopProps {
	/** What sits on the rail: an avatar, a review icon. */
	node: ReactNode;
	first: boolean;
	last: boolean;
	/** Drops the node to the centre of a card's header instead of a 20px row. */
	card?: boolean;
	children: ReactNode;
}

/** One stop on the activity rail: a node, and a line down to the next stop. */
export function PullRequestTimelineStop({
	node,
	first,
	last,
	card = false,
	children,
}: PullRequestTimelineStopProps) {
	return (
		<li className="flex gap-3">
			<div aria-hidden className="flex w-5 shrink-0 flex-col items-center">
				<span
					className={cn(
						"w-px shrink-0",
						card ? "h-2" : "h-0",
						!first && "bg-border",
					)}
				/>
				<div className="flex size-5 shrink-0 items-center justify-center">
					{node}
				</div>
				{last ? null : <span className="w-px flex-1 bg-border" />}
			</div>
			<div className={cn("min-w-0 flex-1", !last && TIMELINE_GAP_CLASS_NAME)}>
				{children}
			</div>
		</li>
	);
}
