import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import type { CloudWorkspaceBootEndReason } from "@superset/db/enums";
import {
	type CloudWorkspaceBootPhase,
	cloudWorkspaceBoots,
	cloudWorkspaces,
} from "@superset/db/schema";
import { and, eq, gt, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import {
	type ControlScope,
	controlTags,
	logControl,
} from "../../lib/control-log";
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
	Sentry.captureException(error, {
		tags: { "cloud_workspace.id": cloudWorkspaceId },
	});
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

/**
 * Why the box stopped, on the open boot of `sessionId` (any open boot when
 * null). It also lands on a boot of a concurrent wake that has not attached
 * yet. The first stop site to write wins; at close the meter keeps it, unless
 * Vercel marked the session failed or aborted, which is `crashed`.
 */
export async function recordBootEnd(
	scope: ControlScope,
	{
		sessionId,
		reason,
	}: { sessionId: string | null; reason: CloudWorkspaceBootEndReason },
): Promise<void> {
	await db
		.update(cloudWorkspaceBoots)
		.set({ endReason: reason })
		.where(
			and(
				eq(cloudWorkspaceBoots.cloudWorkspaceId, scope.cloudWorkspaceId),
				isNull(cloudWorkspaceBoots.stoppedAt),
				isNull(cloudWorkspaceBoots.endReason),
				sessionId === null
					? undefined
					: or(
							isNull(cloudWorkspaceBoots.vercelSessionId),
							eq(cloudWorkspaceBoots.vercelSessionId, sessionId),
						),
			),
		)
		.catch((error) =>
			Sentry.captureException(error, { tags: controlTags(scope) }),
		);
}

const MAX_BOOT_PHASES = 64;

/** How the boot went, once host-service answered. A failed write is reported and the boot goes on. */
export async function recordBootPhases(
	scope: ControlScope & { bootId: string },
	phases: CloudWorkspaceBootPhase[],
): Promise<void> {
	await db
		.update(cloudWorkspaceBoots)
		.set({ phases: phases.slice(0, MAX_BOOT_PHASES) })
		.where(eq(cloudWorkspaceBoots.id, scope.bootId))
		.catch((error) =>
			Sentry.captureException(error, { tags: controlTags(scope) }),
		);
}

/**
 * After a stop we caused: why it stopped, then the asleep record. The reason
 * goes first so the reconcile, which labels an expired stop idle, cannot get
 * there before it.
 */
export async function recordBoxStopped(
	scope: ControlScope,
	stopped: { sessionId: string | null; reason: CloudWorkspaceBootEndReason },
): Promise<void> {
	await recordBootEnd(scope, stopped);
	await recordSandboxAsleep(scope.cloudWorkspaceId, {
		sessionId: stopped.sessionId,
	});
}

/**
 * A stop seen in a provider read, not caused here. Past the recorded expiry it
 * is the timeout the expiry watch would have labelled idle. After one of our
 * own stops the recorded expiry is always past (the asleep write sets it to
 * now), so that boot's reason is right only because `recordBoxStopped` wrote
 * it first, and the first write wins.
 */
export async function recordStopSeen(
	row: {
		id: string;
		organizationId: string;
		sandboxExpiresAt: Date | null;
	},
	{ sessionId }: { sessionId: string | null },
): Promise<void> {
	if (row.sandboxExpiresAt && row.sandboxExpiresAt.getTime() <= Date.now()) {
		await recordBoxStopped(
			{ cloudWorkspaceId: row.id, organizationId: row.organizationId },
			{ sessionId, reason: "idle" },
		);
		return;
	}
	await recordSandboxAsleep(row.id, { sessionId });
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
		logControl("workspace.asleep", {
			cloudWorkspaceId,
			organizationId: slept.organizationId,
		});
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
