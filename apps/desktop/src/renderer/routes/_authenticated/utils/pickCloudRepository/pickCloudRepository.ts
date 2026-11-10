interface EnvironmentRepository {
	fullName: string;
	owner: string;
	name: string;
	defaultBranch: string;
}

/**
 * The repository a cloud workspace reads its branches from. An environment can
 * hold several repositories (the project's own plus, say, a personal setup
 * repo), so prefer the one that backs the selected project and only fall back
 * to the first when there is no project or none matches.
 */
export function pickCloudRepository<T extends EnvironmentRepository>(
	repositories: readonly T[] | null | undefined,
	projectRepositoryFullName: string | null,
): T | null {
	if (!repositories?.length) return null;
	const matching = projectRepositoryFullName
		? repositories.find(
				(repository) =>
					repository.fullName.toLowerCase() ===
					projectRepositoryFullName.toLowerCase(),
			)
		: undefined;
	return matching ?? repositories[0] ?? null;
}
