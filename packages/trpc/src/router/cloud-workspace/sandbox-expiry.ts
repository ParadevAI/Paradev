import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { nudge } from "../../lib/realtime";
import {
	type ActiveWorkspaceSandbox,
	describeSandbox,
	listActiveWorkspaceSandboxes,
	SandboxUnavailableError,
} from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";
import {
	queueSettleWorkspace,
	RECONCILE_LOOKBACK_MS,
	reconcileCloudWorkspaceUsage,
} from "./meter";
import {
	keepUpdatedAt,
	recordSandboxAsleep,
	reportSleepWriteFailure,
} from "./sandbox-sleep";

const WATCH_AFTER_EXPIRY_MS = 5_000;

export interface WatchSandboxExpiryInput {
	cloudWorkspaceId: string;
}

/**
 * For a box we know runs until `expiresAt`. Seeing it wake starts its expiry
 * watch; an extension only moves the expiry, and the watch follows it.
 */
export async function recordSandboxAwake(
	cloudWorkspaceId: string,
	expiresAt: Date,
): Promise<void> {
	await markAwake(cloudWorkspaceId, expiresAt).catch((error) =>
		reportSleepWriteFailure(cloudWorkspaceId, error),
	);
}

async function markAwake(
	cloudWorkspaceId: string,
	expiresAt: Date,
): Promise<void> {
	const [woke] = await db
		.update(cloudWorkspaces)
		.set({ status: "ready", sandboxExpiresAt: expiresAt, ...keepUpdatedAt })
		.where(
			and(
				eq(cloudWorkspaces.id, cloudWorkspaceId),
				or(
					eq(cloudWorkspaces.status, "asleep"),
					and(
						eq(cloudWorkspaces.status, "ready"),
						or(
							isNull(cloudWorkspaces.sandboxExpiresAt),
							lte(cloudWorkspaces.sandboxExpiresAt, sql`now()`),
						),
					),
				),
			),
		)
		.returning({ organizationId: cloudWorkspaces.organizationId });
	if (!woke) {
		await db
			.update(cloudWorkspaces)
			.set({ sandboxExpiresAt: expiresAt, ...keepUpdatedAt })
			.where(
				and(
					eq(cloudWorkspaces.id, cloudWorkspaceId),
					lt(cloudWorkspaces.sandboxExpiresAt, expiresAt),
				),
			);
		return;
	}
	nudge(woke.organizationId, "cloud_workspaces");
	await queueWatch(cloudWorkspaceId, expiresAt);
}

function queueWatch(cloudWorkspaceId: string, expiresAt: Date): Promise<void> {
	const delayMs = expiresAt.getTime() - Date.now() + WATCH_AFTER_EXPIRY_MS;
	return publishCloudWorkspaceJob<WatchSandboxExpiryInput>({
		path: "/api/cloud-workspaces/sandbox-expiry",
		body: { cloudWorkspaceId },
		delaySeconds: Math.max(1, Math.ceil(delayMs / 1000)),
		deduplicationId: `${cloudWorkspaceId}:${expiresAt.getTime()}`,
		runLocally: watchSandboxExpiry,
	}).catch((error) =>
		console.error(
			`[cloud-workspace] could not queue the expiry watch for ${cloudWorkspaceId}`,
			error,
		),
	);
}

/**
 * Runs just after a box's recorded expiry. An extension since then moved the
 * expiry, so the watch follows it; otherwise one provider read confirms the
 * stop before clients and the meter are told.
 */
export async function watchSandboxExpiry({
	cloudWorkspaceId,
}: WatchSandboxExpiryInput): Promise<"rewatched" | "asleep" | "skipped"> {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, cloudWorkspaceId),
		columns: { providerSandboxId: true, sandboxExpiresAt: true },
	});
	if (!row?.sandboxExpiresAt) return "skipped";
	if (row.sandboxExpiresAt.getTime() > Date.now()) {
		await queueWatch(cloudWorkspaceId, row.sandboxExpiresAt);
		return "rewatched";
	}
	const live = await describeSandbox(row.providerSandboxId).catch((error) => {
		if (error instanceof SandboxUnavailableError) return null;
		throw error;
	});
	if (live?.expiresAt && live.expiresAt.getTime() > Date.now()) {
		await recordSandboxAwake(cloudWorkspaceId, live.expiresAt);
		return "rewatched";
	}
	await recordSandboxAsleep(cloudWorkspaceId);
	await queueSettleWorkspace(cloudWorkspaceId);
	return "asleep";
}

/**
 * Corrects sleep state from the provider for boxes whose state changed
 * recently: a stop we did not cause (a crash, an abort) is seen only here.
 * Re-queuing the watch for every awake box replaces one that was lost.
 */
export async function syncSandboxExpiries(
	sandboxes: ActiveWorkspaceSandbox[],
): Promise<void> {
	if (sandboxes.length === 0) return;
	const liveByName = new Map(sandboxes.map((box) => [box.name, box]));
	const rows = await db
		.select({
			id: cloudWorkspaces.id,
			providerSandboxId: cloudWorkspaces.providerSandboxId,
		})
		.from(cloudWorkspaces)
		.where(
			and(
				eq(cloudWorkspaces.provider, "vercel"),
				inArray(cloudWorkspaces.providerSandboxId, [...liveByName.keys()]),
			),
		);
	const now = Date.now();
	for (const row of rows) {
		const expiresAt = liveByName.get(row.providerSandboxId)?.expiresAt;
		if (expiresAt && expiresAt.getTime() > now) {
			await recordSandboxAwake(row.id, expiresAt);
			await queueWatch(row.id, expiresAt);
		} else {
			await recordSandboxAsleep(row.id);
		}
	}
}

/** The 30-minute reconcile: sleep state on every stack, then the meter where billing runs. */
export async function reconcileCloudWorkspaces() {
	const active = await listActiveWorkspaceSandboxes(
		Date.now() - RECONCILE_LOOKBACK_MS,
	).catch((error) => {
		Sentry.captureException(error);
		return null;
	});
	if (active) {
		await syncSandboxExpiries(active).catch((error) =>
			Sentry.captureException(error),
		);
	}
	return reconcileCloudWorkspaceUsage({ active });
}
