import { db } from "@superset/db/client";
import type { CloudWorkspaceStatus } from "@superset/db/schema";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Moves a cloud workspace between statuses only from the ones it may leave.
 * The provisioning job and a delete race on the same row: a delete that
 * lands while the box is being made must win, or the job would flip a
 * `deleted` row back to `ready` and strand a billed sandbox nothing lists.
 * A job passes the box it was started for as `providerSandboxId`: an
 * unarchive that gave the row a new box has made that job stale.
 * Returns false when the row was no longer in any of `from`, or no longer
 * names `providerSandboxId`.
 */
export async function transitionCloudWorkspace(args: {
	id: string;
	from: readonly CloudWorkspaceStatus[];
	to: CloudWorkspaceStatus;
	providerSandboxId?: string;
	set?: Partial<typeof cloudWorkspaces.$inferInsert>;
}): Promise<boolean> {
	const moved = await db
		.update(cloudWorkspaces)
		.set({ ...args.set, status: args.to })
		.where(
			and(
				eq(cloudWorkspaces.id, args.id),
				inArray(cloudWorkspaces.status, [...args.from]),
				args.providerSandboxId === undefined
					? undefined
					: eq(cloudWorkspaces.providerSandboxId, args.providerSandboxId),
			),
		)
		.returning({ id: cloudWorkspaces.id });
	return moved.length > 0;
}
