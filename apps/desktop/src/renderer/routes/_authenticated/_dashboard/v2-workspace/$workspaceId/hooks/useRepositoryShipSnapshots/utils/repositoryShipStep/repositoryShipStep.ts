import type { PRFlowState } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/getPRFlowState";

export type RepositoryShipStep =
	| "commit"
	| "create-pr"
	| "push"
	| "pull-request"
	| "up-to-date"
	| "loading"
	| "unavailable"
	| "error";

const PENDING_STEPS: ReadonlySet<RepositoryShipStep> = new Set([
	"commit",
	"create-pr",
	"push",
]);

/** The next thing one repository needs on its way to a merged pull request. */
export function repositoryShipStep(
	state: PRFlowState,
	hasCommitsAhead: boolean,
): RepositoryShipStep {
	switch (state.kind) {
		case "loading":
		case "busy":
			return "loading";
		case "unavailable":
			return "unavailable";
		case "error":
			return "error";
		case "no-pr":
			if (state.sync.hasUncommitted) return "commit";
			return hasCommitsAhead ? "create-pr" : "up-to-date";
		case "pr-exists":
			if (state.sync?.hasUncommitted) return "commit";
			if (state.sync && state.sync.pushCount > 0) return "push";
			return "pull-request";
	}
}

export function shipSummary(
	repositories: Array<{ step: RepositoryShipStep; hasPullRequest: boolean }>,
) {
	return {
		pendingCount: repositories.filter(({ step }) => PENDING_STEPS.has(step))
			.length,
		pullRequestCount: repositories.filter(
			({ hasPullRequest }) => hasPullRequest,
		).length,
	};
}
