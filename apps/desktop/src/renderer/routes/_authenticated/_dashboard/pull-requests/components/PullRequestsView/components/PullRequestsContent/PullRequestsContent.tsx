import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { GoGitPullRequest } from "react-icons/go";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { LoadMoreSentinel } from "renderer/routes/_authenticated/_dashboard/components/LoadMoreSentinel";
import { serializeProjectFilters } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { pullRequestDetailQueryOptions } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { usePullRequestsSplitViewStore } from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsSplitViewStore";
import type { PullRequestReviewFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import {
	type PullRequestsList,
	pullRequestRowKey,
} from "../../hooks/usePullRequestsList";
import { PullRequestRow } from "../PullRequestRow";
import { PullRequestRowSkeleton } from "./components/PullRequestRowSkeleton";

interface PullRequestsContentProps {
	list: PullRequestsList;
	projectFilters: string[];
	projectTargets: ProjectQueryTarget[];
	areProjectsReady: boolean;
	hasProjects: boolean;
	searchQuery: string;
	authorFilter: string | null;
	reviewFilter: PullRequestReviewFilter | null;
	includeClosed: boolean;
	mergedOnly: boolean;
	selectedPrNumber: number | null;
	selectedPrProjectId: string | null;
	repoSlugByProjectId: Map<string, string>;
}

const NEIGHBOR_PREFETCH_DELAY_MS = 500;
const SKELETON_TITLE_WIDTHS = [
	"w-3/4",
	"w-2/3",
	"w-5/6",
	"w-1/2",
	"w-3/4",
	"w-2/3",
	"w-4/5",
	"w-3/5",
];

export function PullRequestsContent({
	list,
	projectFilters,
	projectTargets,
	areProjectsReady,
	hasProjects,
	searchQuery,
	authorFilter,
	reviewFilter,
	includeClosed,
	mergedOnly,
	selectedPrNumber,
	selectedPrProjectId,
	repoSlugByProjectId,
}: PullRequestsContentProps) {
	const navigate = useNavigate();
	const expandDetail = usePullRequestsSplitViewStore((s) => s.expandDetail);
	const queryClient = useQueryClient();
	const organizationId = useActiveOrganizationId();
	const [isScrolled, setIsScrolled] = useState(false);
	const {
		rows: pullRequests,
		totalCount,
		repoMismatch,
		isFetching,
		isFetchingNextPage,
		hasNextPage,
		error,
		refetch,
		scrollRef,
		sentinelRef,
		isLoadingRowDetails,
	} = list;

	const prefetchDetail = useCallback(
		async (url: string) => {
			const ref = pullRequestRefFromUrl(url);
			if (!ref) return;
			await queryClient.prefetchQuery(
				pullRequestDetailQueryOptions({
					organizationId,
					repoFullName: ref.repoFullName,
					prNumber: ref.number,
				}),
			);
		},
		[queryClient, organizationId],
	);
	// One hover read at a time, and only the row the pointer settled on last
	// waits its turn: sweeping across rows must not queue a GitHub read per row.
	const hoverPrefetch = useRef<{ running: boolean; nextUrl: string | null }>({
		running: false,
		nextUrl: null,
	});
	const prefetchHovered = (url: string) => {
		const state = hoverPrefetch.current;
		if (state.running) {
			state.nextUrl = url;
			return;
		}
		state.running = true;
		void prefetchDetail(url).finally(() => {
			state.running = false;
			const next = state.nextUrl;
			state.nextUrl = null;
			if (next) prefetchHovered(next);
		});
	};

	const selectedIndex = pullRequests.findIndex(
		(pr) =>
			pr.prNumber === selectedPrNumber &&
			(selectedPrProjectId == null || pr.projectId === selectedPrProjectId),
	);
	const neighborUrls =
		selectedIndex < 0
			? ""
			: [pullRequests[selectedIndex + 1], pullRequests[selectedIndex - 1]]
					.flatMap((pr) => (pr ? [pr.url] : []))
					.join(" ");
	useEffect(() => {
		if (!neighborUrls) return;
		const timer = setTimeout(() => {
			for (const url of neighborUrls.split(" ")) void prefetchDetail(url);
		}, NEIGHBOR_PREFETCH_DELAY_MS);
		return () => clearTimeout(timer);
	}, [neighborUrls, prefetchDetail]);

	const handleOpenPreview = (pr: (typeof pullRequests)[number]) => {
		expandDetail();
		navigate({
			to: "/pull-requests/$prNumber",
			params: { prNumber: String(pr.prNumber) },
			search: {
				search: searchQuery || undefined,
				project: pr.projectId,
				repo: pullRequestRefFromUrl(pr.url)?.repoFullName,
				projects: serializeProjectFilters(projectFilters),
				author: authorFilter ?? undefined,
				review: reviewFilter ?? undefined,
				state: mergedOnly ? "merged" : includeClosed ? "all" : undefined,
			},
		});
	};

	if (projectTargets.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="flex flex-col items-center gap-2 text-muted-foreground text-center">
					<GoGitPullRequest className="h-8 w-8" />
					<span className="max-w-prose text-sm text-wrap-pretty">
						{areProjectsReady ? (
							hasProjects ? (
								<Trans>Select a project to see pull requests.</Trans>
							) : (
								<Trans>Add a project to see pull requests.</Trans>
							)
						) : (
							<Trans>Loading projects…</Trans>
						)}
					</span>
				</div>
			</div>
		);
	}

	if (projectTargets.every((target) => !target.hostUrl)) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="flex max-w-prose flex-col items-center gap-2 text-center text-muted-foreground">
					<GoGitPullRequest className="size-8" />
					<span className="text-sm text-wrap-pretty">
						<Trans>The device that hosts this project is unavailable.</Trans>
					</span>
				</div>
			</div>
		);
	}

	const isInitialLoad = isFetching && pullRequests.length === 0;
	// Without a project to disambiguate, only the first row sharing this PR
	// number gets marked selected — distinct repos can reuse the same number.
	const firstMatchingPrIndex =
		selectedPrProjectId == null
			? pullRequests.findIndex((pr) => pr.prNumber === selectedPrNumber)
			: -1;
	return (
		<div
			className="@container flex h-full flex-col overflow-hidden"
			aria-busy={isFetching}
		>
			<div
				ref={scrollRef}
				onScroll={(event) => setIsScrolled(event.currentTarget.scrollTop > 0)}
				className={cn(
					"min-h-0 flex-1 overflow-y-auto border-t transition-colors",
					isScrolled ? "border-border" : "border-transparent",
				)}
			>
				{error instanceof Error && pullRequests.length === 0 ? (
					<div className="flex flex-col items-start gap-3 px-4 py-4 text-sm text-destructive select-text cursor-text">
						<span>{error.message}</span>
						<Button variant="outline" size="sm" onClick={() => refetch()}>
							<Trans>Try again</Trans>
						</Button>
					</div>
				) : repoMismatch ? (
					<div className="px-4 py-3 text-sm text-muted-foreground select-text cursor-text">
						<Trans>PR URL must match {repoMismatch}.</Trans>
					</div>
				) : isInitialLoad ? (
					<div className="flex flex-col gap-1.5 p-2">
						<span className="sr-only">
							<Trans>Loading pull requests…</Trans>
						</span>
						{SKELETON_TITLE_WIDTHS.map((width, index) => (
							<PullRequestRowSkeleton
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder list
								key={index}
								titleWidth={width}
							/>
						))}
					</div>
				) : totalCount === 0 && !isFetching ? (
					<div className="flex h-full items-center justify-center p-8">
						<span className="text-sm text-muted-foreground">
							{mergedOnly ? (
								<Trans>No merged pull requests.</Trans>
							) : includeClosed ? (
								<Trans>No pull requests found.</Trans>
							) : (
								<Trans>No open pull requests.</Trans>
							)}
						</span>
					</div>
				) : (
					<div className="flex flex-col gap-1.5 p-2">
						{error instanceof Error && (
							<div className="flex items-center gap-2 rounded-lg bg-destructive/5 px-4 py-2 text-xs text-destructive">
								<span className="min-w-0 flex-1 truncate select-text cursor-text">
									<Trans>
										Some repositories could not be loaded: {error.message}
									</Trans>
								</span>
								<Button variant="outline" size="xs" onClick={() => refetch()}>
									<Trans>Retry</Trans>
								</Button>
							</div>
						)}
						{pullRequests.map((pr, index) => {
							const rowKey = pullRequestRowKey(pr);
							const isSelected =
								selectedPrNumber === pr.prNumber &&
								(selectedPrProjectId != null
									? selectedPrProjectId === pr.projectId
									: firstMatchingPrIndex === index);
							const repoSlug = repoSlugByProjectId.get(pr.projectId);
							return (
								<PullRequestRow
									key={rowKey}
									pr={pr}
									repoSlug={repoSlug}
									isSelected={isSelected}
									detailsLoading={isLoadingRowDetails}
									onClick={() => handleOpenPreview(pr)}
									onHoverIntent={() => prefetchHovered(pr.url)}
								/>
							);
						})}
						<LoadMoreSentinel
							sentinelRef={sentinelRef}
							hasNextPage={hasNextPage}
							isFetchingNextPage={isFetchingNextPage}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
