import type { RepositoryChangeset } from "../../components/RepositoryChangesetSource";

export function failedRepositoryIdsOf(
	repositoryIds: string[],
	byId: Record<string, Pick<RepositoryChangeset, "isError">>,
): string[] {
	return repositoryIds.filter((id) => byId[id]?.isError === true);
}
