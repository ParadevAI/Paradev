import { isSameRepositorySet } from "../../../../../../utils/repositorySet";

/**
 * A move opens the workspace's repositories exactly, so only environments with
 * that same set can take it. Null `repositoryFullNames` means a repository has
 * no GitHub remote, which no environment can open.
 */
export function splitEnvironmentsByRepositorySet<
	T extends { repositories?: ReadonlyArray<{ fullName: string }> | null },
>({
	environments,
	repositoryFullNames,
}: {
	environments: readonly T[];
	repositoryFullNames: readonly string[] | null;
}): { matching: T[]; nonMatching: T[] } {
	const matching: T[] = [];
	const nonMatching: T[] = [];
	for (const environment of environments) {
		const opens = (environment.repositories ?? []).map(
			(repository) => repository.fullName,
		);
		const matches =
			repositoryFullNames !== null &&
			repositoryFullNames.length > 0 &&
			isSameRepositorySet(opens, repositoryFullNames);
		(matches ? matching : nonMatching).push(environment);
	}
	return { matching, nonMatching };
}
