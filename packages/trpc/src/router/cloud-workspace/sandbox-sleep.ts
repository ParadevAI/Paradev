import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { nudge } from "../../lib/realtime";

/** Sleep writes must not count as an edit: `updatedAt` orders and dates rows. */
export const keepUpdatedAt = { updatedAt: sql`${cloudWorkspaces.updatedAt}` };

/**
 * Sleep state follows a start, stop or extension that already happened, and
 * the reconcile corrects a missed write; failing that operation over it would
 * be worse (a provision would tear down the box it just made).
 */
export function reportSleepWriteFailure(
	cloudWorkspaceId: string,
	error: unknown,
): void {
	console.error(
		`[cloud-workspace] could not record sleep state of ${cloudWorkspaceId}`,
		error,
	);
	Sentry.captureException(error, { extra: { cloudWorkspaceId } });
}

export async function recordSandboxAsleep(
	cloudWorkspaceId: string,
): Promise<void> {
	await markAsleep(cloudWorkspaceId).catch((error) =>
		reportSleepWriteFailure(cloudWorkspaceId, error),
	);
}

async function markAsleep(cloudWorkspaceId: string): Promise<void> {
	const [slept] = await db
		.update(cloudWorkspaces)
		.set({ status: "asleep", sandboxExpiresAt: sql`now()`, ...keepUpdatedAt })
		.where(
			and(
				eq(cloudWorkspaces.id, cloudWorkspaceId),
				eq(cloudWorkspaces.status, "ready"),
			),
		)
		.returning({ organizationId: cloudWorkspaces.organizationId });
	if (slept) {
		nudge(slept.organizationId, "cloud_workspaces");
		return;
	}
	await db
		.update(cloudWorkspaces)
		.set({ sandboxExpiresAt: sql`now()`, ...keepUpdatedAt })
		.where(
			and(
				eq(cloudWorkspaces.id, cloudWorkspaceId),
				or(
					isNull(cloudWorkspaces.sandboxExpiresAt),
					gt(cloudWorkspaces.sandboxExpiresAt, sql`now()`),
				),
			),
		);
}
