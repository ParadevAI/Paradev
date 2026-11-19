import { db } from "@superset/db/client";
import { cloudWorkspaces, environments } from "@superset/db/schema";
import { and, inArray, isNull } from "drizzle-orm";

/**
 * The names among `names` that a workspace row, in any status, or an
 * unarchived environment still names. A real teardown clears the row's name
 * in the write that commits to it, so a name still on a row is that row's:
 * an archived row may be undone onto it, a failed one keeps it for diagnosis.
 */
export async function namedSandboxes(
	names: readonly string[],
): Promise<Set<string>> {
	if (names.length === 0) return new Set();
	const [workspaces, goldens] = await Promise.all([
		db
			.select({ name: cloudWorkspaces.providerSandboxId })
			.from(cloudWorkspaces)
			.where(inArray(cloudWorkspaces.providerSandboxId, [...names])),
		db
			.select({ name: environments.sourceRef })
			.from(environments)
			.where(
				and(
					inArray(environments.sourceRef, [...names]),
					isNull(environments.archivedAt),
				),
			),
	]);
	return new Set([...workspaces, ...goldens].map((row) => row.name));
}

/**
 * The names among `names` that any production row names: a workspace in any
 * status, or an environment, archived ones included (rule 2 deletes those).
 */
export async function namedByAnyRow(
	names: readonly string[],
): Promise<Set<string>> {
	if (names.length === 0) return new Set();
	const [workspaces, goldens] = await Promise.all([
		db
			.select({ name: cloudWorkspaces.providerSandboxId })
			.from(cloudWorkspaces)
			.where(inArray(cloudWorkspaces.providerSandboxId, [...names])),
		db
			.select({ name: environments.sourceRef })
			.from(environments)
			.where(inArray(environments.sourceRef, [...names])),
	]);
	return new Set([...workspaces, ...goldens].map((row) => row.name));
}

export async function liveReferences(args: {
	providerSandboxId: string;
}): Promise<{ sandbox: boolean }> {
	const named = await namedSandboxes([args.providerSandboxId]);
	return { sandbox: named.has(args.providerSandboxId) };
}
