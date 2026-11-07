import { hashKey, type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { useWorkItemsList } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkItemsList";
import { PULL_REQUESTS_SEARCH_QUERY_KEY } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestListPreview";
import type { PullRequestReviewFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import {
	applyPullRequestRowDetails,
	carryOverPullRequestRowDetails,
	pullRequestNumbersByProject,
	pullRequestRowKey,
} from "./utils/pullRequestRowDetails";
import { startRowDetailsRequest } from "./utils/rowDetailsRequests";

const PAGE_SIZE = 30;

type HostServiceClient = ReturnType<typeof getHostServiceClientByUrl>;
type SearchPullRequestsPage = Awaited<
	ReturnType<
		HostServiceClient["workspaceCreation"]["searchPullRequests"]["query"]
	>
>;
type PullRequestsPage = Omit<SearchPullRequestsPage, "pullRequests"> & {
	pullRequests: (SearchPullRequestsPage["pullRequests"][number] & {
		/** Checks, diff stat and branch from this fetch are still on their way. */
		detailsPending: boolean;
		/** The values shown are the previous fetch's, kept while fresh ones load. */
		detailsCarried?: boolean;
	})[];
};

/** The PR list's pages across every serving host, with row details filled in behind the rows. */
export function usePullRequestsList({
	projectTargets,
	searchQuery,
	authorFilter,
	reviewFilter,
	includeClosed,
	mergedOnly,
}: {
	projectTargets: ProjectQueryTarget[];
	searchQuery: string;
	authorFilter: string | null;
	reviewFilter: PullRequestReviewFilter | null;
	includeClosed: boolean;
	mergedOnly: boolean;
}) {
	const query = useDebouncedValue(searchQuery, 300).trim();
	const queryClient = useQueryClient();
	const [rowDetailsInFlight, setRowDetailsInFlight] = useState(0);

	const loadRowDetails = (
		client: HostServiceClient,
		queryKey: QueryKey,
		page: PullRequestsPage,
	) => {
		const projects = pullRequestNumbersByProject(page.pullRequests);
		if (projects.length === 0) return;
		const request = startRowDetailsRequest(queryClient, hashKey(queryKey));
		setRowDetailsInFlight((count) => count + 1);
		client.workspaceCreation.getPullRequestRowDetails
			.query({ projects })
			.then(({ rows }) => {
				if (!request.isLatest()) return;
				queryClient.setQueryData<PullRequestsPage | null>(
					queryKey,
					(current) =>
						current ? applyPullRequestRowDetails(current, rows) : current,
				);
			})
			.catch((error: unknown) => {
				console.warn("[usePullRequestsList] failed to load row details", error);
			})
			.finally(() => {
				setRowDetailsInFlight((count) => count - 1);
				request.finish();
			});
	};

	const list = useWorkItemsList({
		projectTargets,
		resetKey: `${query}\0${authorFilter ?? ""}\0${reviewFilter ?? ""}\0${includeClosed}\0${mergedOnly}`,
		getQueryOptions: ({ target, page }) => ({
			queryKey: [
				...PULL_REQUESTS_SEARCH_QUERY_KEY,
				target.key,
				query,
				authorFilter,
				reviewFilter,
				includeClosed,
				mergedOnly,
				page,
			],
			queryFn: async ({ queryKey }): Promise<PullRequestsPage | null> => {
				const firstProject = target.projects[0];
				if (!target.hostUrl || !firstProject) return null;
				const client = getHostServiceClientByUrl(target.hostUrl);
				const result = await client.workspaceCreation.searchPullRequests.query({
					projectId: firstProject.projectId,
					projectIds: target.projects.map((project) => project.projectId),
					query: query || undefined,
					author: authorFilter ?? undefined,
					review: reviewFilter ?? undefined,
					limit: PAGE_SIZE,
					includeClosed,
					mergedOnly,
					page,
					deferChecks: true,
				});
				// The router types come from this build, the rows come from
				// whichever host-service the host actually runs — hosts update
				// independently and the list is not version-gated. Rows only
				// gained `checks` in host-service 1.20.0, so an older host
				// answers without it. Absent checks read as "none reported".
				// A host that predates `deferChecks` ignores it and answers
				// with checks already filled, so it sends no `checksDeferred`.
				const detailsPending = result.checksDeferred === true;
				const pageData: PullRequestsPage = {
					...result,
					pullRequests: result.pullRequests.map((pullRequest) => ({
						...pullRequest,
						checks: pullRequest.checks ?? [],
						detailsPending,
					})),
				};
				if (!detailsPending) return pageData;
				loadRowDetails(client, queryKey, pageData);
				const previous = queryClient.getQueryData<PullRequestsPage | null>(
					queryKey,
				);
				return previous
					? carryOverPullRequestRowDetails(pageData, previous.pullRequests)
					: pageData;
			},
			enabled: !!target.hostUrl,
			staleTime: 30_000,
			gcTime: 10 * 60_000,
			meta: {
				persist: page === 1 && !query && !authorFilter && !reviewFilter,
			},
		}),
		getRows: (data) => data.pullRequests,
		getRowKey: (pullRequest) => pullRequestRowKey(pullRequest),
	});
	return {
		...list,
		/**
		 * A row still marked pending outside this window (saved from an earlier
		 * session, or its request failed) has nothing coming to fill it.
		 */
		isLoadingRowDetails: list.isFetching || rowDetailsInFlight > 0,
	};
}

export type PullRequestsList = ReturnType<typeof usePullRequestsList>;
