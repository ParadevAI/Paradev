import {
	PR_AUTO_FIX_MAX_ATTEMPTS,
	type PrAutoFixAgent,
	type PrAutoFixCheckout,
	type PrAutoFixPauseReason,
	type PrAutoFixPullRequest,
	type PrAutoFixState,
	type PrAutoFixSwitchBranch,
} from "./types.ts";

/** GitHub can report the old head for a moment after a push. */
export const NO_PUSH_GRACE_MS = 60_000;
/** How long an idle agent may stay silent after a fix prompt before the send counts as lost. */
export const UNSTARTED_FIX_MS = 10 * 60_000;

export type PrAutoFixDecision =
	| { type: "wait" }
	| {
			type: "disable";
			reason: "pull-request-closed" | "workspace-unavailable";
	  }
	| { type: "pause"; reason: PrAutoFixPauseReason }
	/** Back to `watching` with this attempt count, without a fix. */
	| { type: "update"; attempts: number }
	| {
			type: "fix";
			headSha: string;
			attempt: number;
			switchBranch: PrAutoFixSwitchBranch | null;
	  };

export interface PrAutoFixDecisionInput {
	state: PrAutoFixState;
	workspaceAvailable: boolean;
	/** While `fixing`, the agent the fix went to; otherwise the one a fix would go to. */
	agent: PrAutoFixAgent | null;
	checkout: PrAutoFixCheckout | null;
	pullRequest: PrAutoFixPullRequest;
	now: number;
	maxAttempts?: number;
}

function checksOutcome(checks: PrAutoFixPullRequest["checks"]) {
	const settled =
		checks.length > 0 && checks.every((check) => check.status !== "pending");
	const failed = checks.some(
		(check) => check.status === "failure" || check.status === "cancelled",
	);
	return { settled, failed };
}

function decideUnpushedFix(
	state: PrAutoFixState,
	agent: PrAutoFixAgent | null,
	now: number,
): PrAutoFixDecision {
	if (state.fixSentAt === null) return { type: "wait" };
	if (agent === null) {
		return now - state.fixSentAt <= NO_PUSH_GRACE_MS
			? { type: "wait" }
			: { type: "pause", reason: "no-push" };
	}
	if (agent.lastEventAt < state.fixSentAt) {
		return now - state.fixSentAt <= UNSTARTED_FIX_MS
			? { type: "wait" }
			: { type: "pause", reason: "dispatch-interrupted" };
	}
	return now - agent.lastEventAt <= NO_PUSH_GRACE_MS
		? { type: "wait" }
		: { type: "pause", reason: "no-push" };
}

/** What one poll of one watched PR should do. Pure: every input is passed in. */
export function decideAutoFix(
	input: PrAutoFixDecisionInput,
): PrAutoFixDecision {
	const { state, agent, checkout, pullRequest, now } = input;
	const maxAttempts = input.maxAttempts ?? PR_AUTO_FIX_MAX_ATTEMPTS;

	if (!input.workspaceAvailable) {
		return { type: "disable", reason: "workspace-unavailable" };
	}
	if (pullRequest.state !== "open") {
		return { type: "disable", reason: "pull-request-closed" };
	}
	if (
		state.status === "paused" ||
		agent?.busy === true ||
		pullRequest.headSha === null
	) {
		return { type: "wait" };
	}

	const pushedSinceLastFix = pullRequest.headSha !== state.lastHandledHeadSha;
	const { settled, failed } = checksOutcome(pullRequest.checks);

	if (settled && !failed) {
		return state.status === "fixing" || state.attempts > 0
			? { type: "update", attempts: 0 }
			: { type: "wait" };
	}
	if (state.status === "fixing" && !pushedSinceLastFix) {
		// Pending checks on the same commit are a rerun; its verdict decides.
		return settled ? decideUnpushedFix(state, agent, now) : { type: "wait" };
	}
	if (!settled) {
		return state.status === "fixing"
			? { type: "update", attempts: state.attempts }
			: { type: "wait" };
	}
	if (!pushedSinceLastFix) return { type: "wait" };
	if (state.attempts >= maxAttempts) {
		return { type: "pause", reason: "attempt-limit" };
	}

	if (
		agent === null ||
		agent.planMode ||
		checkout === null ||
		pullRequest.headBranch === null
	) {
		return { type: "wait" };
	}
	const fix = {
		type: "fix" as const,
		headSha: pullRequest.headSha,
		attempt: state.attempts + 1,
	};
	if (checkout.branch === pullRequest.headBranch) {
		return { ...fix, switchBranch: null };
	}
	if (!checkout.clean) return { type: "wait" };
	return {
		...fix,
		switchBranch: { to: pullRequest.headBranch, returnBranch: checkout.branch },
	};
}
