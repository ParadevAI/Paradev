import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
	findPullRequestListPreview,
	PULL_REQUESTS_SEARCH_QUERY_KEY,
	usePullRequestListPreview,
} from "./usePullRequestListPreview";

const { act, renderHook } = await import("@testing-library/react");

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
				projectId: "p2",
				repoFullName: null,
				prNumber: 7,
			})?.repoFullName,
		).toBe("acme/Web");
		expect(
			findPullRequestListPreview(queryClient, {
				projectId: "p1",
				repoFullName: null,
				prNumber: 8,
			}),
		).toBeNull();
	});
});

describe("findPullRequestListPreview freshness", () => {
	test("takes the row from the most recently updated page", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(
			[...PULL_REQUESTS_SEARCH_QUERY_KEY, "host", "open"],
			{ pullRequests: [{ ...row("p1", "acme/api", 7), title: "Renamed" }] },
			{ updatedAt: 2_000 },
		);
		queryClient.setQueryData(
			[...PULL_REQUESTS_SEARCH_QUERY_KEY, "host", "all"],
			{ pullRequests: [{ ...row("p1", "acme/api", 7), title: "Old title" }] },
			{ updatedAt: 1_000 },
		);
		expect(
			findPullRequestListPreview(queryClient, {
				projectId: "p1",
				repoFullName: null,
				prNumber: 7,
			})?.title,
		).toBe("Renamed");
	});
});

describe("usePullRequestListPreview", () => {
	test("picks up the row when the list loads after the PR opened", () => {
		const queryClient = new QueryClient();
		const wrapper = ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client: queryClient }, children);
		const { result } = renderHook(
			() =>
				usePullRequestListPreview({
					projectId: "p1",
					repoFullName: "acme/api",
					prNumber: 7,
				}),
			{ wrapper },
		);
		expect(result.current).toBeNull();
		act(() => {
			queryClient.setQueryData([...PULL_REQUESTS_SEARCH_QUERY_KEY, "host", 1], {
				pullRequests: [row("p1", "acme/api", 7)],
			});
		});
		expect(result.current?.title).toBe("acme/api #7");
	});
});
