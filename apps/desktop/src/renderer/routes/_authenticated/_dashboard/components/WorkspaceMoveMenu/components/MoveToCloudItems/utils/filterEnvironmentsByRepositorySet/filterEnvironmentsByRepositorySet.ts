import { isSameRepositorySet } from "../../../../../../utils/repositorySet";

/**
 * A move opens the workspace's repositories exactly, so only environments with
 * that same set can take it. Null `repositoryFullNames` means a repository has
 * no GitHub remote, which no environment can open.
 */
export function filterEnvironmentsByRepositorySet<
	T extends { repositories?: ReadonlyArray<{ fullName: string }> | null },
>({
	environments,
	repositoryFullNames,
}: {
	environments: readonly T[];
	repositoryFullNames: readonly string[] | null;
}): T[] {
	if (repositoryFullNames === null || repositoryFullNames.length === 0) {
		return [];
	}
	return environments.filter((environment) =>
		isSameRepositorySet(
			(environment.repositories ?? []).map((repository) => repository.fullName),
			repositoryFullNames,
		),
	);
}
