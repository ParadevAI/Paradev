import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaceBoots, cloudWorkspaces } from "@superset/db/schema";
import {
	and,
	asc,
	count,
	eq,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import {
	describeSandbox,
	type ListedSandbox,
	listAllSandboxes,
	SandboxUnavailableError,
} from "../../lib/sandbox";
import {
	ARCHIVE_GRACE_SECONDS,
	reapArchivedCloudWorkspace,
	reapUndatedArchivedCloudWorkspace,
} from "./reap";
import { deleteSandboxAndDriveLater, retireAndTearDown } from "./teardown";
import { namedSandboxes } from "./teardown-guard";
import { failCloudWorkspace } from "./transition";

export const RETENTION_JOB_PATH = "/api/cloud-workspaces/jobs/reap-retention";

const DAY_MS = 24 * 60 * 60 * 1000;
/** What Vercel's snapshot expiry gave customers before we owned it. */
export const RETENTION_IDLE_MS = 30 * DAY_MS;
/** Longer than a release or a promote takes to write the name of a golden it built. */
export const ORPHAN_MIN_AGE_MS = 7 * DAY_MS;
/**
 * Every 6 hours, so 800 a day: production made a median 156 workspaces a day
 * and at most 725 in the 30 days to 2026-11-18. A backlog takes more runs.
 */
export const REAP_BATCH = 200;
export const ORPHAN_BATCH = 200;
/** A backstop for a lost archive delete, which deletes inline: few a run. */
export const ARCHIVED_BATCH = 20;
/** The archive's own delete runs at the grace; a day later it has had its retries. */
export const ARCHIVED_BACKSTOP_AFTER_MS = ARCHIVE_GRACE_SECONDS * 1000 + DAY_MS;
/** Stops starting new work here, well inside the route's 300 s; the rest waits for the next run. */
export const RUN_BUDGET_MS = 200_000;
/** At most 4 teardowns queued a second: far under Vercel's 20 deletions a second per team. */
export const TEARDOWN_SPACING_MS = 250;
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
 * Takes the box's name off the row while it is still asleep and idle, and
 * queues the box's teardown; then fails the row as the 410 path does. A wake
 * between the two finds no box and fails the row itself. False when the row
 * changed since it was read: woken, archived, or given another box.
 */
export async function retireIdleWorkspace(
	row: IdleWorkspace,
	cutoff: Date,
): Promise<boolean> {
	const retired = await retireAndTearDown(
		{ id: row.id, providerSandboxId: row.providerSandboxId, driveName: null },
		and(eq(cloudWorkspaces.status, "asleep"), stillIdleAndAsleep(cutoff)),
	);
	if (!retired) return false;
	await failCloudWorkspace({
		scope: { cloudWorkspaceId: row.id, organizationId: row.organizationId },
		from: ["asleep"],
		where: stillIdleAndAsleep(cutoff),
		set: { sandboxUrl: null },
		reason: "snapshot_expired",
		error: new Error(`idle since before ${cutoff.toISOString()}`),
		expected: true,
	});
	return true;
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

function archivedPastGrace(cutoff: Date): SQL {
	return and(
		eq(cloudWorkspaces.provider, "vercel"),
		eq(cloudWorkspaces.status, "archived"),
		or(
			and(
				isNotNull(cloudWorkspaces.deletedAt),
				lt(cloudWorkspaces.deletedAt, cutoff),
			),
			and(
				isNull(cloudWorkspaces.deletedAt),
				lt(cloudWorkspaces.updatedAt, cutoff),
			),
		),
	) as SQL;
}

async function countArchivedPastGrace(cutoff: Date): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(cloudWorkspaces)
		.where(archivedPastGrace(cutoff));
	return row?.n ?? 0;
}

export interface ArchivedWorkspace {
	id: string;
	providerSandboxId: string;
	deletedAt: Date | null;
}

/** The archived rows past their grace whose box is among `names`. */
async function findArchivedPastGraceAmong(
	cutoff: Date,
	names: string[],
): Promise<ArchivedWorkspace[]> {
	const found: ArchivedWorkspace[] = [];
	for (let i = 0; i < names.length; i += NAME_LOOKUP_CHUNK) {
		found.push(
			...(await db
				.select({
					id: cloudWorkspaces.id,
					providerSandboxId: cloudWorkspaces.providerSandboxId,
					deletedAt: cloudWorkspaces.deletedAt,
				})
				.from(cloudWorkspaces)
				.where(
					and(
						archivedPastGrace(cutoff),
						inArray(
							cloudWorkspaces.providerSandboxId,
							names.slice(i, i + NAME_LOOKUP_CHUNK),
						),
					),
				)),
		);
	}
	return found;
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
	listAllSandboxes: typeof listAllSandboxes;
	namedSandboxes: typeof namedAmong;
	countArchivedPastGrace: typeof countArchivedPastGrace;
	findArchivedPastGraceAmong: typeof findArchivedPastGraceAmong;
	reapArchived: typeof reapArchivedCloudWorkspace;
	reapUndatedArchived: typeof reapUndatedArchivedCloudWorkspace;
	tearDownOrphan: (providerSandboxId: string) => Promise<void>;
	pause: (ms: number) => Promise<void>;
}

const defaultDeps: RetentionDeps = {
	findIdleWorkspaces,
	retireIdleWorkspace,
	boxIsRunning,
	listAllSandboxes,
	namedSandboxes: namedAmong,
	countArchivedPastGrace,
	findArchivedPastGraceAmong,
	reapArchived: reapArchivedCloudWorkspace,
	reapUndatedArchived: reapUndatedArchivedCloudWorkspace,
	tearDownOrphan: (providerSandboxId) =>
		deleteSandboxAndDriveLater({ providerSandboxId, driveName: null }),
	pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface RetentionRun {
	idle: {
		found: number;
		retired: number;
		skippedRunning: number;
		skippedChanged: number;
		deferred: number;
		failed: number;
	};
	archived:
		| {
				found: number;
				alreadyDeleted: number;
				deleted: number;
				skipped: number;
				deferred: number;
				failed: number;
		  }
		| { skipped: "not production" };
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
 * The one place a workspace box is deleted for age. Every 6 hours: a workspace asleep
 * and unused for `RETENTION_IDLE_MS` fails as `snapshot_expired`, exactly as a
 * wake that met Vercel's expiry did, and its box is torn down. Then, in
 * production only: an archived box still there a day after its grace is
 * deleted (its own delete was lost), and boxes we tagged that no row names
 * are torn down. Every deployment shares the Vercel project, and a dev
 * database copied from production names production's boxes.
 */
export async function reapCloudWorkspaceRetention({
	now = Date.now(),
	production,
	deps = defaultDeps,
	clock = Date.now,
}: {
	now?: number;
	production: boolean;
	deps?: RetentionDeps;
	clock?: () => number;
}): Promise<RetentionRun> {
	const startedAt = clock();
	const outOfTime = () => clock() - startedAt > RUN_BUDGET_MS;
	const retiredNames = new Set<string>();
	const idle = await reapIdle({ now, deps, retiredNames, outOfTime });
	const notProduction = { skipped: "not production" } as const;
	const boxes = production ? await deps.listAllSandboxes() : [];
	const archived = production
		? await reapArchived({ now, deps, boxes, outOfTime })
		: notProduction;
	const orphans = production
		? await reapOrphans({ now, deps, boxes, retiredNames, outOfTime })
		: notProduction;
	const run = { idle, archived, orphans };
	console.log("[cloud-workspace] retention run", JSON.stringify(run));
	Sentry.logger.info("retention.run", flatten(run));
	if (
		idle.failed ||
		("failed" in archived && archived.failed) ||
		("failed" in orphans && orphans.failed)
	) {
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
	retiredNames,
	outOfTime,
}: {
	now: number;
	deps: RetentionDeps;
	retiredNames: Set<string>;
	outOfTime: () => boolean;
}): Promise<RetentionRun["idle"]> {
	const cutoff = new Date(now - RETENTION_IDLE_MS);
	const rows = await deps.findIdleWorkspaces(cutoff, REAP_BATCH);
	const counts = {
		found: rows.length,
		retired: 0,
		skippedRunning: 0,
		skippedChanged: 0,
		deferred: 0,
		failed: 0,
	};
	for (const [index, row] of rows.entries()) {
		if (outOfTime()) {
			counts.deferred = rows.length - index;
			break;
		}
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
			await deps.pause(TEARDOWN_SPACING_MS);
		} catch (error) {
			counts.failed++;
			Sentry.captureException(error, {
				tags: { "cloud_workspace.id": row.id },
			});
		}
	}
	return counts;
}

async function reapArchived({
	now,
	deps,
	boxes,
	outOfTime,
}: {
	now: number;
	deps: RetentionDeps;
	boxes: ListedSandbox[];
	outOfTime: () => boolean;
}): Promise<Exclude<RetentionRun["archived"], { skipped: string }>> {
	const cutoff = new Date(now - ARCHIVED_BACKSTOP_AFTER_MS);
	const found = await deps.countArchivedPastGrace(cutoff);
	const lingering = await deps.findArchivedPastGraceAmong(
		cutoff,
		boxes.map((box) => box.name),
	);
	const batch = lingering.slice(0, ARCHIVED_BATCH);
	const counts = {
		found,
		alreadyDeleted: found - lingering.length,
		deleted: 0,
		skipped: 0,
		deferred: lingering.length - batch.length,
		failed: 0,
	};
	for (const [index, row] of batch.entries()) {
		if (outOfTime()) {
			counts.deferred += batch.length - index;
			break;
		}
		try {
			const outcome = row.deletedAt
				? await deps.reapArchived({
						cloudWorkspaceId: row.id,
						archivedAt: row.deletedAt.toISOString(),
						stage: "delete",
					})
				: await deps.reapUndatedArchived({
						cloudWorkspaceId: row.id,
						archivedBefore: cutoff,
					});
			if (outcome === "reaped") counts.deleted++;
			else counts.skipped++;
		} catch (error) {
			counts.failed++;
			Sentry.captureException(error, {
				tags: { "cloud_workspace.id": row.id },
			});
		}
	}
	return counts;
}

function isOldAndSettled(box: ListedSandbox, now: number): boolean {
	return (
		SETTLED_STATUSES.has(box.status) &&
		now - box.createdAt > ORPHAN_MIN_AGE_MS &&
		now - box.statusUpdatedAt > ORPHAN_MIN_AGE_MS
	);
}

async function reapOrphans({
	now,
	deps,
	boxes,
	retiredNames,
	outOfTime,
}: {
	now: number;
	deps: RetentionDeps;
	boxes: ListedSandbox[];
	retiredNames: Set<string>;
	outOfTime: () => boolean;
}): Promise<Exclude<RetentionRun["orphans"], { skipped: string }>> {
	const ours = boxes.filter(
		(box) => box.kind === "workspace" || box.kind === "environment",
	);
	const candidates = ours
		.filter((box) => isOldAndSettled(box, now) && !retiredNames.has(box.name))
		.map((box) => box.name);
	const named = await deps.namedSandboxes(candidates);
	const orphaned = candidates.filter((name) => !named.has(name));
	const batch = orphaned.slice(0, ORPHAN_BATCH);
	let queued = 0;
	let failed = 0;
	let unstarted = 0;
	for (const [index, name] of batch.entries()) {
		if (outOfTime()) {
			unstarted = batch.length - index;
			break;
		}
		try {
			await deps.tearDownOrphan(name);
			queued++;
			await deps.pause(TEARDOWN_SPACING_MS);
		} catch (error) {
			failed++;
			Sentry.captureException(error, { extra: { providerSandboxId: name } });
		}
	}
	return {
		listed: ours.length,
		orphaned: orphaned.length,
		queued,
		deferred: orphaned.length - batch.length + unstarted,
		failed,
	};
}

function flatten(run: RetentionRun): Record<string, number | string> {
	return {
		...Object.fromEntries(
			Object.entries(run.idle).map(([key, value]) => [`idle.${key}`, value]),
		),
		...Object.fromEntries(
			Object.entries(run.archived).map(([key, value]) => [
				`archived.${key}`,
				value,
			]),
		),
		...Object.fromEntries(
			Object.entries(run.orphans).map(([key, value]) => [
				`orphans.${key}`,
				value,
			]),
		),
	};
}
