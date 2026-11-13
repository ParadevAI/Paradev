import { describe, expect, test } from "bun:test";
import { findRepositoryPullRequests } from "./findRepositoryPullRequests";

const row = (
	repositoryId: string,
	prNumber: number,
	headRefName: string,
	state: "open" | "closed" = "open",
) => ({
	prNumber,
	title: `${repositoryId} #${prNumber}`,
	url: `https://github.com/o/${repositoryId}/pull/${prNumber}`,
	state,
	isDraft: false,
	headRefName,
	repositoryId,
});

describe("findRepositoryPullRequests", () => {
	test("finds the PR's repository and open PRs on its head branch in the others", async () => {
		const queries: string[] = [];
		const result = await findRepositoryPullRequests(
			async (query) => {
				queries.push(query);
				return query === "#1"
					? { pullRequests: [row("api", 1, "tags"), row("web", 1, "other")] }
					: {
							pullRequests: [
								row("api", 1, "tags"),
								row("shared", 4, "tags"),
								row("web", 9, "tags", "closed"),
							],
						};
			},
			{
				prNumber: 1,
				title: "Tags",
				url: "https://github.com/o/api/pull/1",
				state: "open",
			},
		);
		expect(queries).toEqual(["#1", "head:tags"]);
		expect(result).toEqual({
			api: {
				prNumber: 1,
				title: "Tags",
				url: "https://github.com/o/api/pull/1",
				state: "open",
				headRefName: "tags",
				matched: false,
			},
			shared: {
				prNumber: 4,
				title: "shared #4",
				url: "https://github.com/o/shared/pull/4",
				state: "open",
				headRefName: "tags",
				matched: true,
			},
		});
	});

	test("is null when no repository of the project holds the PR", async () => {
		const result = await findRepositoryPullRequests(
			async () => ({ pullRequests: [row("api", 1, "tags")] }),
			{
				prNumber: 1,
				title: "Elsewhere",
				url: "https://github.com/o/elsewhere/pull/1",
				state: "open",
			},
		);
		expect(result).toBeNull();
	});
});
