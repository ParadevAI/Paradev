type Environment = {
	id: string;
	name: string;
	repositories?: { fullName: string }[] | null;
};

/** The environments a cloud workspace of `repositoryFullName` can start in. */
export function environmentsForRepository<T extends Environment>(
	environments: T[],
	repositoryFullName: string,
): T[] {
	const repository = repositoryFullName.toLowerCase();
	return environments.filter((environment) =>
		(environment.repositories ?? []).some(
			(repo) => repo.fullName.toLowerCase() === repository,
		),
	);
}
