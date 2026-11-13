import { CLIError } from "@superset/cli-framework";
import { requireRepositories } from "./requireRepositories";
import type { HostServiceClient } from "./resolveHostTarget";

/** A repository of the project, named by its name (any case) or id. */
export async function resolveRepository(
	client: HostServiceClient,
	projectId: string,
	ref: string,
) {
	const project = await client.project.get.query({ projectId });
	if (!project) {
		throw new CLIError(`Project ${projectId} is not on this host`);
	}
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

export async function primaryRepository(
	client: HostServiceClient,
	projectId: string,
) {
	const project = await client.project.get.query({ projectId });
	if (!project) {
		throw new CLIError(`Project ${projectId} is not on this host`);
	}
	const primary = requireRepositories(project).find((r) => r.isPrimary);
	if (!primary) {
		throw new CLIError(`Project ${projectId} has no primary repository`);
	}
	return primary;
}
