import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
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
	const newestFirst = queryClient
		.getQueryCache()
		.findAll({ queryKey: PULL_REQUESTS_SEARCH_QUERY_KEY })
		.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
	for (const query of newestFirst) {
		const page = query.state.data as {
			pullRequests?: PullRequestListRow[];
		} | null;
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

/** Recomputed when list pages change, so a PR opened before the list loads still gets its header. */
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
	const subscribe = useCallback(
		(onChange: () => void) =>
			queryClient.getQueryCache().subscribe(({ query }) => {
				if (
					query.queryKey[0] === PULL_REQUESTS_SEARCH_QUERY_KEY[0] &&
					query.queryKey[1] === PULL_REQUESTS_SEARCH_QUERY_KEY[1]
				) {
					onChange();
				}
			}),
		[queryClient],
	);
	const snapshot = useSyncExternalStore(subscribe, () => {
		if (prNumber === null) return null;
		const preview = findPullRequestListPreview(queryClient, {
			projectId,
			repoFullName,
			prNumber,
		});
		return preview ? JSON.stringify(preview) : null;
	});
	return useMemo(
		() => (snapshot ? (JSON.parse(snapshot) as PullRequestPreview) : null),
		[snapshot],
	);
}
