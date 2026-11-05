import type { ReactNode } from "react";
import type {
	PullRequestDetailComment,
	PullRequestDetailCommit,
	PullRequestDetailCommitAuthor,
} from "../../../../hooks/usePullRequestDetail";
import type { PullRequestActivityAuthor } from "../../../../utils/pullRequestAuthorLabel";

/** A card another surface hangs on the rail, such as a workspace's review thread. */
export interface PullRequestActivityEntry {
	id: string;
	createdAt: string | null;
	author: PullRequestActivityAuthor | null;
	card: ReactNode;
}

export type PullRequestReviewVerdict =
	| "APPROVED"
	| "CHANGES_REQUESTED"
	| "DISMISSED";

export type PullRequestTimelineItem =
	| { kind: "comment"; at: number; comment: PullRequestDetailComment }
	| {
			kind: "review-event";
			at: number;
			comment: PullRequestDetailComment;
			verdict: PullRequestReviewVerdict;
	  }
	| {
			kind: "commits";
			at: number;
			author: PullRequestDetailCommitAuthor | null;
			commits: PullRequestDetailCommit[];
	  }
	| { kind: "entry"; at: number; entry: PullRequestActivityEntry };

type StreamItem =
	| PullRequestTimelineItem
	| { kind: "commit"; at: number; commit: PullRequestDetailCommit };

const REVIEW_VERDICTS: ReadonlySet<string> = new Set([
	"APPROVED",
	"CHANGES_REQUESTED",
	"DISMISSED",
]);

function reviewVerdict(
	comment: PullRequestDetailComment,
): PullRequestReviewVerdict | null {
	const state = comment.reviewState?.trim().toUpperCase() ?? "";
	return REVIEW_VERDICTS.has(state)
		? (state as PullRequestReviewVerdict)
		: null;
}

function timestamp(value: string | null | undefined): number {
	const parsed = value ? Date.parse(value) : Number.NaN;
	return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function authorKey(author: PullRequestDetailCommitAuthor | null): string {
	return author?.login ?? author?.name ?? "";
}

/**
 * Comments, commits and the caller's own entries as one stream, oldest
 * first. A review with no note is an event on the rail when it carries a
 * verdict; without one it is only the container GitHub files for a batch of
 * inline comments, so it is dropped. Back-to-back commits by one author
 * read as a single push.
 */
export function buildPullRequestTimeline({
	comments,
	commits,
	entries,
}: {
	comments: PullRequestDetailComment[];
	commits: PullRequestDetailCommit[];
	entries: PullRequestActivityEntry[];
}): PullRequestTimelineItem[] {
	const stream: StreamItem[] = [];
	for (const comment of comments) {
		const at = timestamp(comment.createdAt);
		if (comment.body.trim() !== "") {
			stream.push({ kind: "comment", at, comment });
			continue;
		}
		const verdict = comment.kind === "review" ? reviewVerdict(comment) : null;
		if (verdict) stream.push({ kind: "review-event", at, comment, verdict });
	}
	for (const commit of commits) {
		stream.push({
			kind: "commit",
			at: timestamp(commit.committedDate),
			commit,
		});
	}
	for (const entry of entries) {
		stream.push({ kind: "entry", at: timestamp(entry.createdAt), entry });
	}
	stream.sort((left, right) => left.at - right.at);

	const items: PullRequestTimelineItem[] = [];
	for (const item of stream) {
		if (item.kind !== "commit") {
			items.push(item);
			continue;
		}
		const last = items[items.length - 1];
		if (
			last?.kind === "commits" &&
			authorKey(last.author) === authorKey(item.commit.author)
		) {
			last.commits.push(item.commit);
			continue;
		}
		items.push({
			kind: "commits",
			at: item.at,
			author: item.commit.author,
			commits: [item.commit],
		});
	}
	return items;
}
