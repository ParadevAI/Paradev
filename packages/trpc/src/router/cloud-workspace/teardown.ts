import { db } from "@superset/db/client";
import { cloudWorkspaces, environments } from "@superset/db/schema";
import { type AnyColumn, and, isNull, type SQL, sql } from "drizzle-orm";
import {
	deleteSandbox,
	sandboxDeletesAllowed,
	stopSandbox,
} from "../../lib/sandbox";

/** `column` is one of `names`, passed as one array parameter whatever its length. */
export function anyOf(column: AnyColumn, names: readonly string[]): SQL {
	return sql`${column} = any(${sql.param([...names])}::text[])`;
}

/**
 * The names among `names` that a workspace row, in any status, or an
 * unarchived environment names. A retire clears the row's name in the write
 * that commits to it, so a name still on a row is that row's.
 */
export async function namedSandboxes(
	names: readonly string[],
): Promise<Set<string>> {
	if (names.length === 0) return new Set();
	const [workspaces, goldens] = await Promise.all([
		db
			.select({ name: cloudWorkspaces.providerSandboxId })
			.from(cloudWorkspaces)
			.where(anyOf(cloudWorkspaces.providerSandboxId, names)),
		db
			.select({ name: environments.sourceRef })
			.from(environments)
			.where(
				and(
					anyOf(environments.sourceRef, names),
					isNull(environments.archivedAt),
				),
			),
	]);
	return new Set([...workspaces, ...goldens].map((row) => row.name));
}

/**
 * Deletes a box, with its snapshots, unless a row names it; false when one
 * does. A delete that fails is retried by the cleanup job's next run.
 */
export async function teardownBox(name: string): Promise<boolean> {
	if (!sandboxDeletesAllowed(`box ${name}`)) return false;
	if ((await namedSandboxes([name])).has(name)) return false;
	await stopSandbox(name);
	await deleteSandbox(name);
	return true;
}
