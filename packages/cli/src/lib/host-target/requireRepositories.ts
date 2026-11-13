import { CLIError } from "@superset/cli-framework";

/** Hosts from before multi-repo projects return projects without `repositories`. */
export function requireRepositories<T>(project: {
	repositories?: T[] | null;
}): T[] {
	if (!project.repositories) {
		throw new CLIError(
			"This host is too old for this command",
			"Update Paradev on that host, then try again",
		);
	}
	return project.repositories;
}
