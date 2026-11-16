import { useQuery } from "@tanstack/react-query";
import type { QuickOpenProvider } from "../../quickOpenStore";

/**
 * File matches for the query, through the open workspace page's search: the
 * palette mounts above the workspace client provider, so it cannot query
 * the host itself.
 */
export function useV2FileSearch(
	provider: Pick<QuickOpenProvider, "workspaceId" | "searchFiles"> | null,
	query: string,
) {
	const trimmedQuery = query.trim();

	const { data, isFetching } = useQuery({
		queryKey: ["v2-file-search", provider?.workspaceId ?? "", trimmedQuery],
		queryFn: () => {
			if (!provider) throw new Error("no workspace page to search");
			return provider.searchFiles(trimmedQuery);
		},
		enabled: provider !== null && trimmedQuery.length > 0,
		placeholderData: (previous) => previous ?? [],
	});

	const results =
		data?.map((match) => ({
			id: match.absolutePath,
			name: match.name,
			path: match.absolutePath,
			relativePath: match.relativePath,
		})) ?? [];

	return { results, isFetching };
}
