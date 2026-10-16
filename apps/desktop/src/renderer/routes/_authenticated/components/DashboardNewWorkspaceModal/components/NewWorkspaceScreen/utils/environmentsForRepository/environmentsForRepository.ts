interface EnvironmentWithRepositories {
	repositories?: ReadonlyArray<{ fullName: string }> | null;
}

/**
 * The environments that open on `repositoryFullName`: the sidebar files a
 * cloud workspace by that repository, so one carrying it second would land
 * somewhere else. A null repository keeps every environment.
 */
export function environmentsForRepository<
	T extends EnvironmentWithRepositories,
>(environments: T[], repositoryFullName: string | null): T[] {
	if (!repositoryFullName) return environments;
	const key = repositoryFullName.toLowerCase();
	return environments.filter(
		(environment) =>
			environment.repositories?.[0]?.fullName.toLowerCase() === key,
	);
}
