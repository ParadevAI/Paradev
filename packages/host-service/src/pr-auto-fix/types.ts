import type { PullRequestCheckStatus } from "@superset/shared/pull-request";

/** Fix turns in a row without a green run before the watcher pauses itself. */
export const PR_AUTO_FIX_MAX_ATTEMPTS = 3;

/**
 * - `watching`: waiting for the PR's checks to settle red on a new commit.
 * - `fixing`: a fix prompt was recorded for `lastHandledHeadSha` and no push followed yet.
 * - `paused`: stopped until someone turns it on again (see `pauseReason`).
 */
export type PrAutoFixStatus = "watching" | "fixing" | "paused";

/**
 * - `attempt-limit`: CI still failed after the maximum number of fix turns.
 * - `no-push`: a fix turn ended and the PR head did not move.
 * - `dispatch-interrupted`: the fix prompt may not have reached the agent.
 */
export type PrAutoFixPauseReason =
	| "attempt-limit"
	| "no-push"
	| "dispatch-interrupted";

export interface PrAutoFixState {
	workspaceId: string;
	pullRequestUrl: string;
	prNumber: number;
	status: PrAutoFixStatus;
	pauseReason: PrAutoFixPauseReason | null;
	/** Fix turns started since the last green run. */
	attempts: number;
	/** Head commit whose failing checks already got a fix turn. */
	lastHandledHeadSha: string | null;
	/** The agent the last fix prompt went to. */
	agentTerminalId: string | null;
	/** Null while `fixing` until the prompt is confirmed delivered. */
	fixSentAt: number | null;
	updatedAt: number;
}

/** The agent that would receive a fix, as one poll sees it. */
export interface PrAutoFixAgent {
	/** Working, or waiting on an approval or a question. */
	busy: boolean;
	lastEventAt: number;
	planMode: boolean;
}

/** The workspace checkout; `null` when git could not be read. */
export interface PrAutoFixCheckout {
	branch: string | null;
	clean: boolean;
}

export interface PrAutoFixPullRequest {
	state: "open" | "closed" | "merged";
	/** Null when the host has no fresh read of the PR. */
	headSha: string | null;
	headBranch: string | null;
	checks: ReadonlyArray<{ status: PullRequestCheckStatus }>;
}

export interface PrAutoFixSwitchBranch {
	to: string;
	/** Null for a detached HEAD. */
	returnBranch: string | null;
}

/** What the renderer and CLI see of one watched PR. */
export interface PrAutoFixWatch {
	workspaceId: string;
	pullRequestUrl: string;
	prNumber: number;
	status: PrAutoFixStatus;
	pauseReason: PrAutoFixPauseReason | null;
	attempts: number;
	maxAttempts: number;
	lastHandledHeadSha: string | null;
	updatedAt: number;
}
