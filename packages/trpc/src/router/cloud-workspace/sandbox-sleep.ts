import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, gt, isNull, ne, or, type SQL, sql } from "drizzle-orm";
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

/**
 * The row still records the session that stopped. A wake between the stop
 * and this write recorded its own, newer session, and asleep would then mark
 * a running box. A null session id means the box has none left to compare.
 */
export function stillStoppedSession(sessionId: string | null): SQL | undefined {
	if (sessionId === null) return undefined;
	return or(
		isNull(cloudWorkspaces.sandboxSessionId),
		eq(cloudWorkspaces.sandboxSessionId, sessionId),
	);
}

/** `sessionId` is the session the caller saw stopped, read before or at the stop. */
export async function recordSandboxAsleep(
	cloudWorkspaceId: string,
	{ sessionId }: { sessionId: string | null },
): Promise<void> {
	await markAsleep(cloudWorkspaceId, sessionId).catch((error) =>
		reportSleepWriteFailure(cloudWorkspaceId, error),
	);
}

async function markAsleep(
	cloudWorkspaceId: string,
	sessionId: string | null,
): Promise<void> {
	const recorded = {
		sandboxExpiresAt: sql`now()`,
		...(sessionId ? { sandboxSessionId: sessionId } : {}),
		...keepUpdatedAt,
	};
	const [slept] = await db
		.update(cloudWorkspaces)
		.set({ status: "asleep", ...recorded })
		.where(
			and(
				eq(cloudWorkspaces.id, cloudWorkspaceId),
				eq(cloudWorkspaces.status, "awake"),
				stillStoppedSession(sessionId),
			),
		)
		.returning({ organizationId: cloudWorkspaces.organizationId });
	if (slept) {
		nudge(slept.organizationId, "cloud_workspaces");
		return;
	}
	await db
		.update(cloudWorkspaces)
		.set(recorded)
		.where(
			and(
				eq(cloudWorkspaces.id, cloudWorkspaceId),
				ne(cloudWorkspaces.status, "awake"),
				stillStoppedSession(sessionId),
				or(
					isNull(cloudWorkspaces.sandboxExpiresAt),
					gt(cloudWorkspaces.sandboxExpiresAt, sql`now()`),
				),
			),
		);
}
