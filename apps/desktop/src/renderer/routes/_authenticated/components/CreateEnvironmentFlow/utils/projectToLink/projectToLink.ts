export interface EnvironmentProject {
	id: string;
	repositoryFullName: string | null;
}

export function projectToLink(
	project: EnvironmentProject | null | undefined,
	primaryRepositoryFullName: string,
): string | null {
	if (!project?.repositoryFullName) return null;
	return project.repositoryFullName.toLowerCase() ===
		primaryRepositoryFullName.toLowerCase()
		? project.id
		: null;
}
