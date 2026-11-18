import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaceBoots, cloudWorkspaces } from "@superset/db/schema";
import { and, asc, eq, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import {
	describeSandbox,
	listTaggedSandboxes,
	SandboxUnavailableError,
	type TaggedSandbox,
} from "../../lib/sandbox";
import { nextSandboxNameFor } from "./provision";
import { queueTeardown } from "./teardown";
import { namedSandboxes } from "./teardown-guard";
import { failCloudWorkspace } from "./transition";

export const RETENTION_JOB_PATH = "/api/cloud-workspaces/jobs/reap-retention";

const DAY_MS = 24 * 60 * 60 * 1000;
/** What Vercel's snapshot expiry gave customers before we owned it. */
export const RETENTION_IDLE_MS = 30 * DAY_MS;
/** Longer than a release or a promote takes to write the name of a golden it built. */
export const ORPHAN_MIN_AGE_MS = 7 * DAY_MS;
export const REAP_BATCH = 50;
export const ORPHAN_BATCH = 50;
/** One delete a second: far under Vercel's 20 deletions a second per team. */
const TEARDOWN_SPACING_SECONDS = 1;
const NAME_LOOKUP_CHUNK = 500;
const SETTLED_STATUSES = new Set(["stopped", "failed", "aborted"]);

export interface IdleWorkspace {
	id: string;
	organizationId: string;
	providerSandboxId: string;
}

/**
 * Nothing used the workspace since `cutoff`. Boots count because a wake
 * writes its boot before Vercel resumes the box, so one in flight keeps the
 * row. `sandbox_expires_at` and `created_at` count too: when they disagree
 * with the boots, the later one wins and the box is kept longer.
 */
export function idleSince(cutoff: Date): SQL {
	const at = sql`${cutoff.toISOString()}::timestamptz`;
	return and(
		lt(cloudWorkspaces.createdAt, cutoff),
		or(
			isNull(cloudWorkspaces.sandboxExpiresAt),
			lt(cloudWorkspaces.sandboxExpiresAt, cutoff),
		),
		sql`not exists (select 1 from ${cloudWorkspaceBoots} where ${cloudWorkspaceBoots.cloudWorkspaceId} = ${cloudWorkspaces.id} and (${cloudWorkspaceBoots.stoppedAt} is null or ${cloudWorkspaceBoots.stoppedAt} >= ${at} or ${cloudWorkspaceBoots.startedAt} >= ${at}))`,
	) as SQL;
}

function stillIdleAndAsleep(cutoff: Date): SQL {
	return and(
		eq(cloudWorkspaces.provider, "vercel"),
		isNull(cloudWorkspaces.deletedAt),
		idleSince(cutoff),
	) as SQL;
}

async function findIdleWorkspaces(
	cutoff: Date,
	limit: number,
): Promise<IdleWorkspace[]> {
	return db
		.select({
			id: cloudWorkspaces.id,
			organizationId: cloudWorkspaces.organizationId,
			providerSandboxId: cloudWorkspaces.providerSandboxId,
		})
		.from(cloudWorkspaces)
		.where(
			and(eq(cloudWorkspaces.status, "asleep"), stillIdleAndAsleep(cutoff)),
		)
		.orderBy(asc(cloudWorkspaces.createdAt))
		.limit(limit);
}

/**
 * The 410 path's terminal state, and the box's name taken off the row in the
 * same update, so nothing can wake the box being deleted. False when the row
 * changed since it was read: woken, archived, or given another box.
 */
export function retireIdleWorkspace(
	row: IdleWorkspace,
	cutoff: Date,
): Promise<boolean> {
	return failCloudWorkspace({
		scope: { cloudWorkspaceId: row.id, organizationId: row.organizationId },
		from: ["asleep"],
		where: and(
			eq(cloudWorkspaces.providerSandboxId, row.providerSandboxId),
			stillIdleAndAsleep(cutoff),
		),
		set: {
			sandboxUrl: null,
			providerSandboxId: nextSandboxNameFor(row.id),
		},
		reason: "snapshot_expired",
		error: new Error(`idle since before ${cutoff.toISOString()}`),
		expected: true,
	});
}

/** True when the box runs a session now; false when it is stopped or gone. */
async function boxIsRunning(providerSandboxId: string): Promise<boolean> {
	try {
		return (await describeSandbox(providerSandboxId)).running;
	} catch (error) {
		if (error instanceof SandboxUnavailableError) return false;
		throw error;
	}
}

async function namedAmong(names: string[]): Promise<Set<string>> {
	const named = new Set<string>();
	for (let i = 0; i < names.length; i += NAME_LOOKUP_CHUNK) {
		for (const name of await namedSandboxes(
			names.slice(i, i + NAME_LOOKUP_CHUNK),
		)) {
			named.add(name);
		}
	}
	return named;
}

export interface RetentionDeps {
	findIdleWorkspaces: typeof findIdleWorkspaces;
	retireIdleWorkspace: typeof retireIdleWorkspace;
	boxIsRunning: typeof boxIsRunning;
	listTaggedSandboxes: typeof listTaggedSandboxes;
	namedSandboxes: typeof namedAmong;
	queueTeardown: (
		providerSandboxId: string,
		delaySeconds: number,
	) => Promise<void>;
}

const defaultDeps: RetentionDeps = {
	findIdleWorkspaces,
	retireIdleWorkspace,
	boxIsRunning,
	listTaggedSandboxes,
	namedSandboxes: namedAmong,
	queueTeardown: (providerSandboxId, delaySeconds) =>
		queueTeardown(
			{ providerSandboxId, driveName: null, attempt: 0 },
			delaySeconds,
		),
};

export interface RetentionRun {
	idle: {
		found: number;
		retired: number;
		skippedRunning: number;
		skippedChanged: number;
		failed: number;
	};
	orphans:
		| {
				listed: number;
				orphaned: number;
				queued: number;
				deferred: number;
				failed: number;
		  }
		| { skipped: "not production" };
}

/**
 * The one place a workspace box is deleted for age. Daily: a workspace asleep
 * and unused for `RETENTION_IDLE_MS` fails as `snapshot_expired`, exactly as a
 * wake that met Vercel's expiry did, and its box is torn down. Then, in
 * production only, boxes we tagged that no row names are torn down. Every
 * deployment shares the Vercel project, so another database would see
 * production's boxes as orphans.
 */
export async function reapCloudWorkspaceRetention({
	now = Date.now(),
	production,
	deps = defaultDeps,
}: {
	now?: number;
	production: boolean;
	deps?: RetentionDeps;
}): Promise<RetentionRun> {
	let slot = 0;
	const queue = (name: string) =>
		deps.queueTeardown(name, slot++ * TEARDOWN_SPACING_SECONDS);
	const retiredNames = new Set<string>();
	const idle = await reapIdle({ now, deps, queue, retiredNames });
	const orphans = production
		? await reapOrphans({ now, deps, queue, retiredNames })
		: ({ skipped: "not production" } as const);
	const run = { idle, orphans };
	console.log("[cloud-workspace] retention run", JSON.stringify(run));
	Sentry.logger.info("retention.run", flatten(run));
	if (idle.failed || ("failed" in orphans && orphans.failed)) {
		Sentry.captureMessage("cloud workspace retention run had failures", {
			level: "warning",
			extra: { ...run },
		});
	}
	return run;
}

async function reapIdle({
	now,
	deps,
	queue,
	retiredNames,
}: {
	now: number;
	deps: RetentionDeps;
	queue: (name: string) => Promise<void>;
	retiredNames: Set<string>;
}): Promise<RetentionRun["idle"]> {
	const cutoff = new Date(now - RETENTION_IDLE_MS);
	const rows = await deps.findIdleWorkspaces(cutoff, REAP_BATCH);
	const counts = {
		found: rows.length,
		retired: 0,
		skippedRunning: 0,
		skippedChanged: 0,
		failed: 0,
	};
	for (const row of rows) {
		try {
			if (await deps.boxIsRunning(row.providerSandboxId)) {
				counts.skippedRunning++;
				continue;
			}
			if (!(await deps.retireIdleWorkspace(row, cutoff))) {
				counts.skippedChanged++;
				continue;
			}
			counts.retired++;
			retiredNames.add(row.providerSandboxId);
			// A retired box whose teardown is not queued is an orphan: a later run queues it.
			await queue(row.providerSandboxId);
		} catch (error) {
			counts.failed++;
			Sentry.captureException(error, {
				tags: { "cloud_workspace.id": row.id },
			});
		}
	}
	return counts;
}

function isOldAndSettled(box: TaggedSandbox, now: number): boolean {
	return (
		SETTLED_STATUSES.has(box.status) &&
		now - box.createdAt > ORPHAN_MIN_AGE_MS &&
		now - box.statusUpdatedAt > ORPHAN_MIN_AGE_MS
	);
}

async function reapOrphans({
	now,
	deps,
	queue,
	retiredNames,
}: {
	now: number;
	deps: RetentionDeps;
	queue: (name: string) => Promise<void>;
	retiredNames: Set<string>;
}): Promise<Exclude<RetentionRun["orphans"], { skipped: string }>> {
	const boxes = [
		...(await deps.listTaggedSandboxes("workspace")),
		...(await deps.listTaggedSandboxes("environment")),
	];
	const candidates = boxes
		.filter((box) => isOldAndSettled(box, now) && !retiredNames.has(box.name))
		.map((box) => box.name);
	const named = await deps.namedSandboxes(candidates);
	const orphaned = candidates.filter((name) => !named.has(name));
	const batch = orphaned.slice(0, ORPHAN_BATCH);
	let queued = 0;
	let failed = 0;
	for (const name of batch) {
		try {
			await queue(name);
			queued++;
		} catch (error) {
			failed++;
			Sentry.captureException(error, { extra: { providerSandboxId: name } });
		}
	}
	return {
		listed: boxes.length,
		orphaned: orphaned.length,
		queued,
		deferred: orphaned.length - batch.length,
		failed,
	};
}

function flatten(run: RetentionRun): Record<string, number | string> {
	return {
		...Object.fromEntries(
			Object.entries(run.idle).map(([key, value]) => [`idle.${key}`, value]),
		),
		...Object.fromEntries(
			Object.entries(run.orphans).map(([key, value]) => [
				`orphans.${key}`,
				value,
			]),
		),
	};
}
