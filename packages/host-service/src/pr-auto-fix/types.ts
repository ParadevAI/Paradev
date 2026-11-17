import type { PullRequestCheckStatus } from "@superset/shared/pull-request";

export const PR_AUTO_FIX_MAX_ATTEMPTS = 3;

export type PrAutoFixStatus = "watching" | "fixing" | "paused";

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
	attempts: number;
	lastHandledHeadSha: string | null;
	agentTerminalId: string | null;
	/** Null while `fixing` until the prompt is confirmed delivered. */
	fixSentAt: number | null;
	updatedAt: number;
}

export interface PrAutoFixAgent {
	busy: boolean;
	lastEventAt: number;
	planMode: boolean;
}

export interface PrAutoFixCheckout {
	branch: string | null;
	clean: boolean;
}

export interface PrAutoFixPullRequest {
	state: "open" | "closed" | "merged";
	headSha: string | null;
	headBranch: string | null;
	checks: ReadonlyArray<{ status: PullRequestCheckStatus }>;
}

export interface PrAutoFixSwitchBranch {
	to: string;
	returnBranch: string | null;
}

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
