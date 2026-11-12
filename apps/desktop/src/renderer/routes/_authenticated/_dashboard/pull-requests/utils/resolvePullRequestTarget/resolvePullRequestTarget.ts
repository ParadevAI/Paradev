export interface PullRequestProject {
	id: string;
	projectKey?: string;
	repoOwner?: string | null;
	repoName?: string | null;
	/** A multi-repo project has no repository of its own; its PRs name one of its repositories. */
	kind?: "repository" | "container";
}

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
	const projectRepo =
		project?.repoOwner && project.repoName
			? `${project.repoOwner}/${project.repoName}`
			: null;
	const repository = repoFullName ?? projectRepo;
	const matches =
		project?.kind === "container" ||
		(!!projectRepo && projectRepo.toLowerCase() === repository?.toLowerCase());
	return {
		repoFullName: repository,
		projectId: project && (!repoFullName || matches) ? projectId : null,
	};
}
