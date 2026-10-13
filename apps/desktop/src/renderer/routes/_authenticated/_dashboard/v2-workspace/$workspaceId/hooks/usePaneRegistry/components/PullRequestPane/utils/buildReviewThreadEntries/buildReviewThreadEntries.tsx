import type { PullRequestActivityEntry } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestActivity";
import type { NormalizedComment } from "../../../../../../components/CommentsSection/types";
import {
	PullRequestCommentCard,
	type PullRequestCommentCardProps,
} from "../../components/PullRequestCommentCard";

type BuildReviewThreadEntriesInput = Omit<
	PullRequestCommentCardProps,
	"comment" | "replies"
> & {
	/** Oldest first, so a thread's root comment comes before its replies. */
	comments: NormalizedComment[];
};

/** The workspace's review comments as rail entries, one card per thread with its replies inside. */
export function buildReviewThreadEntries({
	comments,
	...cardProps
}: BuildReviewThreadEntriesInput): PullRequestActivityEntry[] {
	const threads = new Map<string, NormalizedComment[]>();
	for (const comment of comments) {
		const key = comment.threadId ?? comment.id;
		const thread = threads.get(key);
		if (thread) thread.push(comment);
		else threads.set(key, [comment]);
	}
	return [...threads.values()].flatMap((thread) => {
		const [root, ...replies] = thread;
		if (!root) return [];
		return [
			{
				id: root.id,
				createdAt: root.createdAt ?? null,
				author: { login: root.authorLogin, avatarUrl: root.avatarUrl },
				card: (
					<PullRequestCommentCard
						comment={root}
						replies={replies}
						{...cardProps}
					/>
				),
			},
		];
	});
}
