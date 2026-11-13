import { describe, expect, test } from "bun:test";
import {
	primaryCheckoutRepositoryId,
	sumCheckoutDiffStats,
	workspaceRowPullRequest,
} from "./workspaceCheckoutSummaries";

describe("workspaceRowPullRequest", () => {
	test("prefers the primary checkout's PR", () => {
		expect(
			workspaceRowPullRequest(
				[
					{ repositoryId: "api", pullRequest: { number: 1 } },
					{ repositoryId: "web", pullRequest: { number: 2 } },
				],
				"web",
			),
		).toEqual({ repositoryId: "web", pullRequest: { number: 2 } });
	});

	test("falls back to the first checkout with a PR", () => {
		expect(
			workspaceRowPullRequest(
				[
					{ repositoryId: "api", pullRequest: null },
					{ repositoryId: "web", pullRequest: { number: 2 } },
				],
				"api",
			),
		).toEqual({ repositoryId: "web", pullRequest: { number: 2 } });
		expect(workspaceRowPullRequest([], null)).toBeNull();
	});
});

test("sumCheckoutDiffStats adds every checkout", () => {
	expect(
		sumCheckoutDiffStats([
			{ additions: 1, deletions: 2, fileCount: 3 },
			{ additions: 10, deletions: 20, fileCount: 30 },
		]),
	).toEqual({ additions: 11, deletions: 22, fileCount: 33 });
});

test("primaryCheckoutRepositoryId reads the primary checkout", () => {
	expect(
		primaryCheckoutRepositoryId({
			checkouts: [
				{ repositoryId: "api", isPrimary: false },
				{ repositoryId: "web", isPrimary: true },
			],
		}),
	).toBe("web");
	expect(primaryCheckoutRepositoryId({})).toBeNull();
});
