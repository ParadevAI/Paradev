import { cn } from "@superset/ui/utils";
import type { PullRequestDetailCommit } from "../../../../../../hooks/usePullRequestDetail";
import { TIMELINE_GAP_CLASS_NAME } from "../../../PullRequestTimelineStop";
import { PullRequestCommitLink } from "../PullRequestCommitLink";

interface PullRequestCommitStopProps {
	commit: PullRequestDetailCommit;
	last: boolean;
}

/** A commit on the rail; the line runs through its dot so a push reads as one stretch. */
export function PullRequestCommitStop({
	commit,
	last,
}: PullRequestCommitStopProps) {
	return (
		<li className="flex gap-3">
			<div aria-hidden className="flex w-5 shrink-0 flex-col items-center">
				<span className="h-1.5 w-px shrink-0 bg-border" />
				<span className="size-2 shrink-0 rounded-full border-[1.5px] border-muted-foreground/60" />
				{last ? null : <span className="w-px flex-1 bg-border" />}
			</div>
			<div className={cn("min-w-0 flex-1", !last && TIMELINE_GAP_CLASS_NAME)}>
				<PullRequestCommitLink commit={commit} />
			</div>
		</li>
	);
}
