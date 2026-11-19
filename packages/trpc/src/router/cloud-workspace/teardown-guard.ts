import { db } from "@superset/db/client";
import { cloudWorkspaces, environments } from "@superset/db/schema";
import { and, inArray, isNull } from "drizzle-orm";

const CHUNK = 500;

/**
 * The names among `names` that a workspace row, in any status, or an
 * environment names: an unarchived one, or with `archived` any. A real
 * teardown clears the row's name in the write that commits to it, so a name
 * still on a row is that row's.
 */
export async function namedSandboxes(
	names: readonly string[],
	{ archived = false }: { archived?: boolean } = {},
): Promise<Set<string>> {
	const named = new Set<string>();
	for (let i = 0; i < names.length; i += CHUNK) {
		const chunk = names.slice(i, i + CHUNK);
		const [workspaces, goldens] = await Promise.all([
			db
				.select({ name: cloudWorkspaces.providerSandboxId })
				.from(cloudWorkspaces)
				.where(inArray(cloudWorkspaces.providerSandboxId, chunk)),
			db
				.select({ name: environments.sourceRef })
				.from(environments)
				.where(
					and(
						inArray(environments.sourceRef, chunk),
						archived ? undefined : isNull(environments.archivedAt),
					),
				),
		]);
		for (const row of [...workspaces, ...goldens]) named.add(row.name);
	}
	return named;
}

export async function liveReferences(args: {
	providerSandboxId: string;
}): Promise<{ sandbox: boolean }> {
	const named = await namedSandboxes([args.providerSandboxId]);
	return { sandbox: named.has(args.providerSandboxId) };
}
