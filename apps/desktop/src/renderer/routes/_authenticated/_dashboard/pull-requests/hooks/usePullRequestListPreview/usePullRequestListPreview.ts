import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";

export const PULL_REQUESTS_SEARCH_QUERY_KEY = [
	"pullRequests",
	"searchPullRequests",
] as const;

/** What the list already knows about a pull request, shown while its detail loads. */
export interface PullRequestPreview {
	repoFullName: string;
	number: number;
	title: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	authorLogin: string | null;
	headRef: string | null;
}

interface PullRequestListRow {
	projectId: string;
	prNumber: number;
	url: string;
	title: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	authorLogin: string | null;
	headRefName: string | null;
}

export function findPullRequestListPreview(
	queryClient: QueryClient,
	{
		projectId,
		repoFullName,
		prNumber,
	}: {
		projectId: string | null;
		repoFullName: string | null;
		prNumber: number;
	},
): PullRequestPreview | null {
	const pages = queryClient.getQueriesData<{
		pullRequests?: PullRequestListRow[];
	} | null>({ queryKey: PULL_REQUESTS_SEARCH_QUERY_KEY });
	for (const [, page] of pages) {
		for (const row of page?.pullRequests ?? []) {
			if (row.prNumber !== prNumber) continue;
			const rowRepo = pullRequestRefFromUrl(row.url)?.repoFullName;
			if (!rowRepo) continue;
			const matches = repoFullName
				? rowRepo.toLowerCase() === repoFullName.toLowerCase()
				: row.projectId === projectId;
			if (!matches) continue;
			return {
				repoFullName: rowRepo,
				number: row.prNumber,
				title: row.title,
				state: row.state,
				isDraft: row.isDraft,
				authorLogin: row.authorLogin,
				headRef: row.headRefName,
			};
		}
	}
	return null;
}

export function usePullRequestListPreview({
	projectId,
	repoFullName,
	prNumber,
}: {
	projectId: string | null;
	repoFullName: string | null;
	prNumber: number | null;
}): PullRequestPreview | null {
	const queryClient = useQueryClient();
	return useMemo(
		() =>
			prNumber === null
				? null
				: findPullRequestListPreview(queryClient, {
						projectId,
						repoFullName,
						prNumber,
					}),
		[queryClient, projectId, repoFullName, prNumber],
	);
}
