import { useQuery } from "@tanstack/react-query";
import type { QuickOpenProvider } from "../../quickOpenStore";

/**
 * File matches for the query, through the open workspace page's search: the
 * palette mounts above the workspace client provider, so it cannot query
 * the host itself.
 */
export function useV2FileSearch(
	provider: Pick<
		QuickOpenProvider,
		"workspaceId" | "searchFiles" | "canSearch"
	> | null,
	query: string,
) {
	const trimmedQuery = query.trim();
	const workspaceId = provider?.workspaceId ?? "";
	const canSearch = provider?.canSearch === true && trimmedQuery.length > 0;

	const { data, isFetching } = useQuery({
		queryKey: ["v2-file-search", workspaceId, trimmedQuery],
		queryFn: () => {
			if (!provider) throw new Error("no workspace page to search");
			return provider.searchFiles(trimmedQuery);
		},
		enabled: canSearch,
		placeholderData: (previous, previousQuery) =>
			previousQuery?.queryKey[1] === workspaceId ? (previous ?? []) : [],
	});

	// placeholderData carries the last matches over to a query that will not run.
	const results = !canSearch
		? []
		: (data?.map((match) => ({
				id: match.absolutePath,
				name: match.name,
				path: match.absolutePath,
				relativePath: match.relativePath,
			})) ?? []);

	return { results, isFetching };
}
