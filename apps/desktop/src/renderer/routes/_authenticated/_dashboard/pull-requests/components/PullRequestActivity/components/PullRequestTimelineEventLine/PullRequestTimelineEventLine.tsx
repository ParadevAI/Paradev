import type { ReactNode } from "react";
import type { PullRequestTime } from "../../../../utils/describePullRequestTime";

interface PullRequestTimelineEventLineProps {
	name: string;
	action: ReactNode;
	time: PullRequestTime | null;
}

/** "name action · time" on the 20px row every rail event shares. */
export function PullRequestTimelineEventLine({
	name,
	action,
	time,
}: PullRequestTimelineEventLineProps) {
	return (
		<p className="flex h-5 min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
			<span className="min-w-0 truncate font-medium text-foreground">
				{name}
			</span>
			<span className="shrink-0">{action}</span>
			{time ? (
				<>
					<span aria-hidden>·</span>
					<time dateTime={time.iso} title={time.absolute} className="shrink-0">
						{time.relative}
					</time>
				</>
			) : null}
		</p>
	);
}
