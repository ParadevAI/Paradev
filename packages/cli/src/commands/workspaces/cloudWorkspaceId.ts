import { CLIError } from "@superset/cli-framework";

/** The id given, else the cloud workspace this runs in. */
export function cloudWorkspaceId(id: string | null | undefined): string {
	const resolved = id ?? process.env.SUPERSET_SANDBOX_WORKSPACE_ID;
	if (!resolved) {
		throw new CLIError(
			"No cloud workspace",
			"Pass an id, or run this inside a cloud workspace",
		);
	}
	return resolved;
}
