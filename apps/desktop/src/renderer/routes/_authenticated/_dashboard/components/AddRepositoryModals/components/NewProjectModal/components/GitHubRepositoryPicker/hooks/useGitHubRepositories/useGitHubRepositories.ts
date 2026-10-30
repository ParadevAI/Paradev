import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { GitHubRepositoryPage } from "../../utils/fetchRepositoryPage";

export function useGitHubRepositories(
	hostUrl: string | null,
	fetchPage: (page: number) => Promise<GitHubRepositoryPage>,
	enabled: boolean,
) {
	const query = useInfiniteQuery({
		queryKey: ["github-repositories", hostUrl],
		queryFn: ({ pageParam }) => fetchPage(pageParam),
		initialPageParam: 1,
		getNextPageParam: (lastPage, allPages) =>
			lastPage.hasMore ? allPages.length + 1 : undefined,
		enabled,
		staleTime: 60_000,
	});
	const { fetchNextPage, hasNextPage, isError, isFetchingNextPage } = query;

	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage, isError]);

	return {
		repositories: query.data?.pages.flatMap((page) => page.repositories) ?? [],
		isLoading: query.isLoading,
		error: query.isError ? query.error : null,
	};
}
