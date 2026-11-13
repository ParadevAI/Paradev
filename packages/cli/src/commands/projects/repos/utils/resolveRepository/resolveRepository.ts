import { CLIError } from "@superset/cli-framework";
import type { HostServiceClient } from "../../../../../lib/host-target";

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
	const repository = project.repositories.find(
		(r) => r.id === ref || r.name.toLowerCase() === ref.toLowerCase(),
	);
	if (!repository) {
		throw new CLIError(
			`Project ${project.name} has no repository "${ref}"`,
			`Use one of: ${project.repositories.map((r) => r.name).join(", ")}`,
		);
	}
	return repository;
}

export async function primaryRepository(
	client: HostServiceClient,
	projectId: string,
) {
	const project = await client.project.get.query({ projectId });
	const primary = project?.repositories.find((r) => r.isPrimary);
	if (!primary) {
		throw new CLIError(`Project ${projectId} is not on this host`);
	}
	return primary;
}
