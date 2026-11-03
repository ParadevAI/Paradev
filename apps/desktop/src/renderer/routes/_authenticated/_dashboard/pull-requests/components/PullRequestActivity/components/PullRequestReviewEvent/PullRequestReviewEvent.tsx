import { CircleCheck, CircleX, MessageSquare } from "lucide-react";
import type { PullRequestDetailComment } from "../../../../hooks/usePullRequestDetail";
import { usePullRequestActivityLayout } from "../../../../providers/PullRequestActivityLayoutProvider";
import { describePullRequestTime } from "../../../../utils/describePullRequestTime";
import { pullRequestAuthorLabel } from "../../../../utils/pullRequestAuthorLabel";
import type { PullRequestReviewVerdict } from "../../utils/buildPullRequestTimeline";
import { PullRequestReviewStateLabel } from "../PullRequestReviewStateLabel";
import { PullRequestTimelineEventLine } from "../PullRequestTimelineEventLine";
import { PullRequestTimelineStop } from "../PullRequestTimelineStop";

const VERDICT_ICON = {
	APPROVED: {
		Icon: CircleCheck,
		className: "text-emerald-600 [.dark_&]:text-emerald-400",
	},
	CHANGES_REQUESTED: {
		Icon: CircleX,
		className: "text-rose-600 [.dark_&]:text-rose-400",
	},
	DISMISSED: { Icon: MessageSquare, className: "text-muted-foreground" },
} as const;

interface PullRequestReviewEventProps {
	comment: PullRequestDetailComment;
	verdict: PullRequestReviewVerdict;
	first: boolean;
	last: boolean;
}

/** A review without a note: its verdict's icon and one line of who and when. */
export function PullRequestReviewEvent({
	comment,
	verdict,
	first,
	last,
}: PullRequestReviewEventProps) {
	const layout = usePullRequestActivityLayout();
	const { Icon, className } = VERDICT_ICON[verdict];
	const icon = <Icon strokeWidth={1.75} className={`size-4 ${className}`} />;
	const line = (
		<PullRequestTimelineEventLine
			name={pullRequestAuthorLabel(comment.author)}
			action={<PullRequestReviewStateLabel state={verdict} />}
			time={describePullRequestTime(comment.createdAt)}
		/>
	);
	if (layout === "row") {
		return (
			<li className="flex h-8 min-w-0 items-center gap-2 px-3">
				<span className="flex size-5 shrink-0 items-center justify-center">
					{icon}
				</span>
				<div className="min-w-0 flex-1">{line}</div>
			</li>
		);
	}
	return (
		<PullRequestTimelineStop first={first} last={last} node={icon}>
			{line}
		</PullRequestTimelineStop>
	);
}
