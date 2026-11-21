interface GroupableEnvironment {
	projectIds?: readonly string[] | null;
	repositories?: ReadonlyArray<{ fullName: string }> | null;
}

/**
 * Splits environments into those for the project and the rest. An environment
 * is for the project when it is linked to it, or when it opens on the
 * project's repository, which is how a teammate's checkout of the same
 * repository finds it.
 */
export function groupEnvironmentsForProject<T extends GroupableEnvironment>({
	environments,
	projectId,
	repositoryFullName,
}: {
	environments: readonly T[];
	projectId: string | null;
	repositoryFullName: string | null;
}): { linked: T[]; other: T[] } {
	const repository = repositoryFullName?.toLowerCase() ?? null;
	const linked: T[] = [];
	const other: T[] = [];
	for (const environment of environments) {
		const isLinked =
			(projectId !== null && !!environment.projectIds?.includes(projectId)) ||
			(repository !== null &&
				environment.repositories?.[0]?.fullName.toLowerCase() === repository);
		(isLinked ? linked : other).push(environment);
	}
	return { linked, other };
}
