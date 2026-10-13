import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { PullRequestDetailComment } from "../../../../hooks/usePullRequestDetail";
import {
	type PullRequestCommentSeverity,
	parseFindingComment,
} from "../../../../utils/parseFindingComment";
import { PullRequestActivityCard } from "../../../PullRequestActivityCard";
import { PullRequestMarkdown } from "../../../PullRequestMarkdown";
import { PullRequestReviewStateLabel } from "../PullRequestReviewStateLabel";

const SEVERITY_CLASS_NAME: Record<PullRequestCommentSeverity, string> = {
	High: "text-red-600 [.dark_&]:text-[#f87171]",
	Medium: "text-amber-600 [.dark_&]:text-[#fbbf24]",
	Low: "text-muted-foreground",
};

function SeverityLabel({ severity }: { severity: PullRequestCommentSeverity }) {
	switch (severity) {
		case "High":
			return <Trans>High severity</Trans>;
		case "Medium":
			return <Trans>Medium severity</Trans>;
		default:
			return <Trans>Low severity</Trans>;
	}
}

interface PullRequestActivityCommentProps {
	comment: PullRequestDetailComment;
	prUrl: string;
}

/** A conversation comment or review as a card; a bot finding leads with its title and severity. */
export function PullRequestActivityComment({
	comment,
	prUrl,
}: PullRequestActivityCommentProps) {
	const finding = parseFindingComment(comment.body);
	const body = (finding ? finding.body : comment.body).trim();
	return (
		<PullRequestActivityCard
			author={comment.author}
			meta={
				<>
					{comment.kind === "review" ? (
						<PullRequestReviewStateLabel state={comment.reviewState} />
					) : null}
					{finding ? (
						<span
							className={cn("shrink-0", SEVERITY_CLASS_NAME[finding.severity])}
						>
							<SeverityLabel severity={finding.severity} />
						</span>
					) : null}
				</>
			}
			createdAt={comment.createdAt}
			url={comment.url}
			actions={
				<a
					href={comment.url ?? prUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
				>
					<Trans>Reply</Trans>
				</a>
			}
		>
			{finding || body ? (
				<>
					{finding ? (
						<p className="mb-2 text-sm font-semibold text-foreground">
							{finding.title}
						</p>
					) : null}
					{body ? <PullRequestMarkdown body={body} size="comment" /> : null}
				</>
			) : null}
		</PullRequestActivityCard>
	);
}
