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
				repositoryIds: ["repo"],
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
				repositoryIds: ["repo"],
			}),
		).toEqual({ checkout: "local", isPrCheckout: false });
	});

	test("several repositories: every PR, branch and worktree goes to its checkout", () => {
		expect(
			buildCheckoutsInput({
				draft: {
					...emptyDraft,
					checkout: "local",
					checkoutBaseBranches: { api: "main", web: "ignored" },
					checkoutPullRequests: {
						shared: {
							...linkedPR,
							prNumber: 4,
							headRefName: "t",
							matched: true,
						},
						web: { ...linkedPR, headRefName: "t", matched: false },
						docs: { ...linkedPR, prNumber: 9, headRefName: "t", matched: true },
					},
					checkoutPullRequestsFor: linkedPR.url,
					checkoutWorktrees: { docs: { path: "/wt/docs", branch: "x" } },
				},
				linkedPR,
				primaryRepositoryId: "api",
				isMultiRepo: true,
				repositoryIds: ["api", "web", "shared", "docs"],
			}),
		).toEqual({
			checkout: "worktree",
			isPrCheckout: true,
			checkouts: {
				web: { pr: 7 },
				shared: { pr: 4 },
				api: { baseBranch: "main" },
				docs: { worktreePath: "/wt/docs" },
			},
			pullRequest: { repository: "o/web", number: 7 },
		});
	});

	const sharedPullRequest = {
		...linkedPR,
		prNumber: 4,
		headRefName: "t",
		matched: true,
	};

	test("several repositories: a worktree picked for the linked PR's repository replaces the PR", () => {
		const result = buildCheckoutsInput({
			draft: {
				...emptyDraft,
				checkoutPullRequests: { shared: sharedPullRequest },
				checkoutPullRequestsFor: linkedPR.url,
				checkoutWorktrees: { web: { path: "/wt/web", branch: "t" } },
			},
			linkedPR,
			primaryRepositoryId: "api",
			isMultiRepo: true,
			repositoryIds: ["api", "web", "shared", "docs"],
		});
		expect(result.pullRequest).toBeUndefined();
		expect(result.checkouts).toEqual({
			shared: { pr: 4 },
			web: { worktreePath: "/wt/web" },
		});
	});

	test("several repositories: a base branch picked for the linked PR's repository replaces the PR", () => {
		const result = buildCheckoutsInput({
			draft: {
				...emptyDraft,
				checkoutBaseBranches: { web: "dev" },
				checkoutPullRequests: { shared: sharedPullRequest },
				checkoutPullRequestsFor: linkedPR.url,
			},
			linkedPR,
			primaryRepositoryId: "api",
			isMultiRepo: true,
			repositoryIds: ["api", "web", "shared", "docs"],
		});
		expect(result.pullRequest).toBeUndefined();
		expect(result.checkouts).toEqual({
			shared: { pr: 4 },
			web: { baseBranch: "dev" },
		});
	});

	test("several repositories: no PR is sent once every resolved PR is replaced", () => {
		expect(
			buildCheckoutsInput({
				draft: {
					...emptyDraft,
					checkoutBaseBranches: { web: "dev", shared: "main" },
					checkoutPullRequestsFor: linkedPR.url,
				},
				linkedPR,
				primaryRepositoryId: "api",
				isMultiRepo: true,
				repositoryIds: ["api", "web", "shared", "docs"],
			}),
		).toEqual({
			checkout: "worktree",
			isPrCheckout: false,
			checkouts: { web: { baseBranch: "dev" }, shared: { baseBranch: "main" } },
		});
	});

	test("several repositories: an unresolved PR goes by its repository name", () => {
		expect(
			buildCheckoutsInput({
				draft: emptyDraft,
				linkedPR,
				primaryRepositoryId: "api",
				isMultiRepo: true,
				repositoryIds: ["api", "web", "shared", "docs"],
			}),
		).toEqual({
			checkout: "worktree",
			isPrCheckout: true,
			pullRequest: { repository: "o/web", number: 7 },
		});
	});

	test("several repositories: picks for a repository removed since are dropped", () => {
		expect(
			buildCheckoutsInput({
				draft: {
					...emptyDraft,
					checkoutBaseBranches: { api: "main", removed: "dev" },
					checkoutPullRequests: {
						removed: { ...linkedPR, headRefName: "t", matched: true },
					},
					checkoutPullRequestsFor: linkedPR.url,
					checkoutWorktrees: { gone: { path: "/wt/gone", branch: "x" } },
				},
				linkedPR,
				primaryRepositoryId: "api",
				isMultiRepo: true,
				repositoryIds: ["api", "web"],
			}),
		).toEqual({
			checkout: "worktree",
			isPrCheckout: true,
			checkouts: { api: { baseBranch: "main" } },
			pullRequest: { repository: "o/web", number: 7 },
		});
	});

	test("several repositories: a worktree picked in an unresolved PR's repository replaces the PR", () => {
		const draft = {
			...emptyDraft,
			checkoutWorktrees: { web: { path: "/wt/web", branch: "t" } },
		};
		const githubNames = { api: "o/api", web: "O/Web" };
		expect(
			buildCheckoutsInput({
				draft,
				linkedPR,
				primaryRepositoryId: "api",
				isMultiRepo: true,
				repositoryIds: ["api", "web"],
				githubNames,
			}),
		).toEqual({
			checkout: "worktree",
			isPrCheckout: false,
			checkouts: { web: { worktreePath: "/wt/web" } },
		});
		expect(
			buildCheckoutsInput({
				draft: {
					...emptyDraft,
					checkoutWorktrees: { api: { path: "/wt/api", branch: "t" } },
				},
				linkedPR,
				primaryRepositoryId: "api",
				isMultiRepo: true,
				repositoryIds: ["api", "web"],
				githubNames,
			}).pullRequest,
		).toEqual({ repository: "o/web", number: 7 });
	});

	test("several repositories: a base branch picked in an unresolved PR's repository replaces the PR", () => {
		const githubNames = { api: "o/api", web: "O/Web" };
		expect(
			buildCheckoutsInput({
				draft: { ...emptyDraft, checkoutBaseBranches: { web: "dev" } },
				linkedPR,
				primaryRepositoryId: "api",
				isMultiRepo: true,
				repositoryIds: ["api", "web"],
				githubNames,
			}),
		).toEqual({
			checkout: "worktree",
			isPrCheckout: false,
			checkouts: { web: { baseBranch: "dev" } },
		});
		expect(
			buildCheckoutsInput({
				draft: { ...emptyDraft, checkoutBaseBranches: { api: "dev" } },
				linkedPR,
				primaryRepositoryId: "api",
				isMultiRepo: true,
				repositoryIds: ["api", "web"],
				githubNames,
			}).pullRequest,
		).toEqual({ repository: "o/web", number: 7 });
	});
});
