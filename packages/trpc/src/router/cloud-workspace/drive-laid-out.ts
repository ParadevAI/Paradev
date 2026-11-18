import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

/** Once a boot answered with the drive laid out, every later wake expects the drive to name this workspace. */
export async function recordDriveLaidOut(
	cloudWorkspaceId: string,
): Promise<void> {
	await db
		.update(cloudWorkspaces)
		.set({ driveLaidOutAt: sql`now()` })
		.where(
			and(
				eq(cloudWorkspaces.id, cloudWorkspaceId),
				isNull(cloudWorkspaces.driveLaidOutAt),
			),
		);
}
