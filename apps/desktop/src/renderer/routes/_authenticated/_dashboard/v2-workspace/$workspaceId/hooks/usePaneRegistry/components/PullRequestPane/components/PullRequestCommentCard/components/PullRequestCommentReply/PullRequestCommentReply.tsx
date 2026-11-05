import { PullRequestMarkdown } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestMarkdown";
import { describePullRequestTime } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/describePullRequestTime";
import type { NormalizedComment } from "../../../../../../../../components/CommentsSection/types";

interface PullRequestCommentReplyProps {
	comment: NormalizedComment;
}

/** A later comment in a review thread, inside its root's card. */
export function PullRequestCommentReply({
	comment,
}: PullRequestCommentReplyProps) {
	const time = describePullRequestTime(comment.createdAt);
	return (
		<div className="min-w-0 border-t border-border/60 py-2.5 first:border-t-0">
			<p className="mb-1.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
				<span className="min-w-0 truncate font-medium text-foreground">
					{comment.authorLogin}
				</span>
				{time ? (
					<>
						<span aria-hidden>·</span>
						{comment.url ? (
							<a
								href={comment.url}
								target="_blank"
								rel="noopener noreferrer"
								title={time.absolute}
								className="shrink-0 transition-colors hover:text-foreground"
							>
								{time.relative}
							</a>
						) : (
							<time
								dateTime={time.iso}
								title={time.absolute}
								className="shrink-0"
							>
								{time.relative}
							</time>
						)}
					</>
				) : null}
			</p>
			<PullRequestMarkdown body={comment.body} size="comment" />
		</div>
	);
}
