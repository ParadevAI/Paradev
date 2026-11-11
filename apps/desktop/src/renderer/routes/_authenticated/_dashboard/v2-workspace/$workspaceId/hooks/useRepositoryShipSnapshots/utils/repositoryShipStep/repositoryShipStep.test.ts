import { describe, expect, test } from "bun:test";
import type {
	BranchSyncStatus,
	PRFlowState,
	PullRequest,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/getPRFlowState";
import { repositoryShipStep, shipSummary } from "./repositoryShipStep";

const sync = (overrides: Partial<BranchSyncStatus> = {}): BranchSyncStatus => ({
	hasRepo: true,
	hasUpstream: true,
	pushCount: 0,
	pullCount: 0,
	isDefaultBranch: false,
	isDetached: false,
	hasUncommitted: false,
	currentBranch: "feature/priority",
	defaultBranch: "main",
	...overrides,
});
const pr = { number: 142 } as PullRequest;
const noPr = (overrides: Partial<BranchSyncStatus> = {}): PRFlowState => ({
	kind: "no-pr",
	sync: sync(overrides),
});

describe("repositoryShipStep", () => {
	test("uncommitted changes come first, with or without a pull request", () => {
		expect(repositoryShipStep(noPr({ hasUncommitted: true }), true)).toBe(
			"commit",
		);
		expect(
			repositoryShipStep(
				{ kind: "pr-exists", pr, sync: sync({ hasUncommitted: true }) },
				true,
			),
		).toBe("commit");
	});

	test("committed work without a pull request goes to Create PR", () => {
		expect(repositoryShipStep(noPr({ pushCount: 1 }), true)).toBe("create-pr");
		expect(repositoryShipStep(noPr({ hasUpstream: false }), true)).toBe(
			"create-pr",
		);
	});

	test("a branch with nothing ahead of its base has nothing to ship", () => {
		expect(repositoryShipStep(noPr({ hasUpstream: false }), false)).toBe(
			"up-to-date",
		);
	});

	test("an open pull request asks for a push only when commits wait", () => {
		expect(
			repositoryShipStep(
				{ kind: "pr-exists", pr, sync: sync({ pushCount: 2 }) },
				true,
			),
		).toBe("push");
		expect(
			repositoryShipStep({ kind: "pr-exists", pr, sync: sync() }, true),
		).toBe("pull-request");
	});

	test("states the ship flow can't act on pass through", () => {
		expect(repositoryShipStep({ kind: "loading" }, true)).toBe("loading");
		expect(
			repositoryShipStep(
				{ kind: "unavailable", reason: "default-branch" },
				true,
			),
		).toBe("unavailable");
		expect(
			repositoryShipStep({ kind: "error", pr: null, message: "x" }, true),
		).toBe("error");
	});
});

describe("shipSummary", () => {
	test("counts repositories with a step left and pull requests", () => {
		expect(
			shipSummary([
				{ step: "commit", hasPullRequest: true },
				{ step: "create-pr", hasPullRequest: false },
				{ step: "pull-request", hasPullRequest: true },
				{ step: "up-to-date", hasPullRequest: false },
			]),
		).toEqual({ pendingCount: 2, pullRequestCount: 2 });
	});
});
