import { describe, expect, test } from "bun:test";
import { buildCheckoutsInput } from "./buildCheckoutsInput";

const emptyDraft = {
	checkout: "worktree" as const,
	baseBranch: null,
	checkoutBaseBranches: {},
	checkoutPullRequests: {},
	checkoutPullRequestsFor: null,
	checkoutWorktrees: {},
};

const linkedPR = {
	prNumber: 7,
	title: "Tags",
	url: "https://github.com/o/web/pull/7",
	state: "open",
};

describe("buildCheckoutsInput", () => {
	test("one repository: the base branch and PR go to its checkout", () => {
		expect(
			buildCheckoutsInput({
				draft: { ...emptyDraft, baseBranch: "dev" },
				linkedPR,
				primaryRepositoryId: "repo",
				isMultiRepo: false,
			}),
		).toEqual({
			checkout: "worktree",
			isPrCheckout: true,
			checkouts: { repo: { baseBranch: "dev", pr: 7 } },
		});
	});

	test("one repository: a local checkout sends no checkouts", () => {
		expect(
			buildCheckoutsInput({
				draft: { ...emptyDraft, checkout: "local", baseBranch: "dev" },
				linkedPR: null,
				primaryRepositoryId: "repo",
				isMultiRepo: false,
			}),
		).toEqual({ checkout: "local", isPrCheckout: false });
	});

	test("several repositories: PRs first, unmatched before matched, then branches and worktrees", () => {
		const result = buildCheckoutsInput({
			draft: {
				...emptyDraft,
				checkout: "local",
				checkoutBaseBranches: { api: "main", web: "ignored" },
				checkoutPullRequests: {
					shared: { ...linkedPR, prNumber: 4, headRefName: "t", matched: true },
					web: { ...linkedPR, headRefName: "t", matched: false },
					docs: { ...linkedPR, prNumber: 9, headRefName: "t", matched: true },
				},
				checkoutPullRequestsFor: linkedPR.url,
				checkoutWorktrees: { docs: { path: "/wt/docs", branch: "x" } },
			},
			linkedPR,
			primaryRepositoryId: "api",
			isMultiRepo: true,
		});
		expect(result).toEqual({
			checkout: "worktree",
			isPrCheckout: true,
			checkouts: {
				web: { pr: 7 },
				shared: { pr: 4 },
				api: { baseBranch: "main" },
				docs: { worktreePath: "/wt/docs" },
			},
		});
		expect(Object.keys(result.checkouts ?? {})).toEqual([
			"web",
			"shared",
			"api",
			"docs",
		]);
	});

	test("several repositories: an unresolved PR goes by its repository name", () => {
		expect(
			buildCheckoutsInput({
				draft: emptyDraft,
				linkedPR,
				primaryRepositoryId: "api",
				isMultiRepo: true,
			}),
		).toEqual({
			checkout: "worktree",
			isPrCheckout: true,
			pullRequest: { repository: "o/web", number: 7 },
		});
	});
});
