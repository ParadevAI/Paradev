interface GroupableEnvironment {
	repositories?: ReadonlyArray<{ fullName: string }> | null;
}

/**
 * Splits environments into those for the project and the rest. An environment
 * is for the project when it opens on the project's repository, which is also
 * how a teammate's checkout of the same repository finds it.
 */
export function groupEnvironmentsForProject<T extends GroupableEnvironment>({
	environments,
	repositoryFullName,
}: {
	environments: readonly T[];
	repositoryFullName: string | null;
}): { linked: T[]; other: T[] } {
	const repository = repositoryFullName?.toLowerCase() ?? null;
	const linked: T[] = [];
	const other: T[] = [];
	for (const environment of environments) {
		const isLinked =
			repository !== null &&
			environment.repositories?.[0]?.fullName.toLowerCase() === repository;
		(isLinked ? linked : other).push(environment);
	}
	return { linked, other };
}
