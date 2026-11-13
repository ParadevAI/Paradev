interface PullRequestRepository {
	id: string;
	owner: string | null;
	repoName: string | null;
}

export interface PullRequestProject {
	id: string;
	projectKey?: string;
	primaryRepositoryId?: string;
	repositories?: readonly PullRequestRepository[];
}

function fullNameOf(repository: PullRequestRepository): string | null {
	return repository.owner && repository.repoName
		? `${repository.owner}/${repository.repoName}`
		: null;
}

/**
 * The repository a PR link names, and the project and repository of that
 * project that hold it. A link that names a repository the project does not
 * hold keeps the repository but drops the project.
 */
export function resolvePullRequestTarget({
	projectId,
	repoFullName,
	projects,
}: {
	projectId: string | null;
	repoFullName?: string | null;
	projects: readonly PullRequestProject[];
}) {
	const project = projects.find(
		(candidate) =>
			candidate.id === projectId || candidate.projectKey === projectId,
	);
	const repositories = project?.repositories ?? [];
	const primary =
		repositories.find(
			(repository) => repository.id === project?.primaryRepositoryId,
		) ?? repositories[0];
	const matched = repoFullName
		? repositories.find(
				(repository) =>
					fullNameOf(repository)?.toLowerCase() === repoFullName.toLowerCase(),
			)
		: primary;
	return {
		repoFullName: repoFullName ?? (primary ? fullNameOf(primary) : null),
		projectId: project && (!repoFullName || matched) ? projectId : null,
		repositoryId: matched?.id ?? null,
	};
}
