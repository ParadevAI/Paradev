import { CLIError } from "@superset/cli-framework";
import { requireRepositories } from "./requireRepositories";
import type { HostServiceClient } from "./resolveHostTarget";

export type HostProject = NonNullable<
	Awaited<ReturnType<HostServiceClient["project"]["get"]["query"]>>
>;

export async function getHostProject(
	client: HostServiceClient,
	projectId: string,
): Promise<HostProject> {
	const project = await client.project.get.query({ projectId });
	if (!project) {
		throw new CLIError(`Project ${projectId} is not on this host`);
	}
	return project;
}

/** A repository of the project, named by its name (any case) or id. */
export function findRepository(project: HostProject, ref: string) {
	const repositories = requireRepositories(project);
	const repository = repositories.find(
		(r) => r.id === ref || r.name.toLowerCase() === ref.toLowerCase(),
	);
	if (!repository) {
		throw new CLIError(
			`Project ${project.name} has no repository "${ref}"`,
			`Use one of: ${repositories.map((r) => r.name).join(", ")}`,
		);
	}
	return repository;
}

export function findPrimaryRepository(project: HostProject) {
	const primary = requireRepositories(project).find((r) => r.isPrimary);
	if (!primary) {
		throw new CLIError(`Project ${project.id} has no primary repository`);
	}
	return primary;
}

export async function resolveRepository(
	client: HostServiceClient,
	projectId: string,
	ref: string,
) {
	return findRepository(await getHostProject(client, projectId), ref);
}
