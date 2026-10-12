import { createContext, useContext } from "react";
import type { PullRequestActivityAuthor } from "../../utils/pullRequestAuthorLabel";

/** A review-thread comment the composer will answer; the id is the REST one GitHub's reply endpoint takes. */
export interface PullRequestReplyTarget {
	commentId: number;
	author: PullRequestActivityAuthor | null;
}

export type RequestPullRequestReply = (target: PullRequestReplyTarget) => void;

const PullRequestActivityReplyContext =
	createContext<RequestPullRequestReply | null>(null);

export const PullRequestActivityReplyProvider =
	PullRequestActivityReplyContext.Provider;

/** Null where no composer can take a reply: the cloud route, an older host. */
export function usePullRequestActivityReply(): RequestPullRequestReply | null {
	return useContext(PullRequestActivityReplyContext);
}
