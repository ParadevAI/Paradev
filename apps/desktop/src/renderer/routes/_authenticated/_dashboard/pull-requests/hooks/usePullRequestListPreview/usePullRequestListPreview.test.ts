import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	findPullRequestListPreview,
	PULL_REQUESTS_SEARCH_QUERY_KEY,
} from "./usePullRequestListPreview";

function row(projectId: string, repo: string, prNumber: number) {
	return {
		projectId,
		prNumber,
		url: `https://github.com/${repo}/pull/${prNumber}`,
		title: `${repo} #${prNumber}`,
		state: "open" as const,
		isDraft: false,
		authorLogin: "maya",
		headRefName: "fix",
	};
}

describe("findPullRequestListPreview", () => {
	test("picks the row from the linked repository when two repos share a number", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData([...PULL_REQUESTS_SEARCH_QUERY_KEY, "host", 1], {
			pullRequests: [row("p1", "acme/api", 7), row("p2", "acme/Web", 7)],
		});
		expect(
			findPullRequestListPreview(queryClient, {
				projectId: null,
				repoFullName: "acme/web",
				prNumber: 7,
			}),
		).toEqual({
			repoFullName: "acme/Web",
			number: 7,
			title: "acme/Web #7",
			state: "open",
			isDraft: false,
			authorLogin: "maya",
			headRef: "fix",
		});
		expect(
			findPullRequestListPreview(queryClient, {
				projectId: "p1",
				repoFullName: null,
				prNumber: 7,
			})?.repoFullName,
		).toBe("acme/api");
		expect(
			findPullRequestListPreview(queryClient, {
				projectId: "p1",
				repoFullName: null,
				prNumber: 8,
			}),
		).toBeNull();
	});
});
