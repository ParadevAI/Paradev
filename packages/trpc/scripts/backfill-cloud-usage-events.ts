import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { db } from "@superset/db/client";
import {
	type AutumnUsageEvent,
	autumnUsageByLock,
	LOCK_SETTLED_MS,
} from "@superset/db/cloud-usage-autumn";
import { recordedUsage } from "@superset/db/cloud-usage-events";
import {
	cloudUsageEvents,
	cloudWorkspaceBoots,
	cloudWorkspaces,
	type InsertCloudUsageEvent,
} from "@superset/db/schema";
import { BOX_GB_MINUTES_FEATURE_ID } from "@superset/shared/billing";
import { eq, sql } from "drizzle-orm";

/**
 * Fills cloud_usage_events from what Autumn holds, for every settled lock that has no row: the
 * locks metered before the meter wrote rows (M5a), and any lock whose row write failed since.
 * Also fills created_by_user_id on boots made before authorizeBoot wrote it.
 *
 * History gets one row per lock, Autumn's net: the sum of its events per boot, lock sequence and
 * feature. Autumn's events do not say which is a reservation, an adjustment, a track or a refund,
 * so the windows of a lock with several sends are not known. The row's sent_at and window_to are
 * the lock's last event; window_from is window_to less the amount at the boot's GB. A CPU row has
 * the boot's start and stop. An event that cannot be tied to a boot is reported, not written.
 *
 * A lock with a higher sequence than its boot row's lock_seq was taken but never recorded by the
 * boot; Autumn refunds it days later, so it is listed, not written: a row could never be corrected.
 *
 * A lock is settled when its boot has moved past it or closed, and its last event is
 * LOCK_SETTLED_MS older than the export. Reports what it would do unless `--apply` is passed.
 * Safe to run again: it only inserts, and only for a lock with no row.
 *
 * Usage: bun run packages/trpc/scripts/backfill-cloud-usage-events.ts --events FILE [--apply]
 */

const BATCH = 500;
const HALF_MICRO = 0.0000005;

const { values } = parseArgs({
	options: {
		events: { type: "string" },
		apply: { type: "boolean", default: false },
	},
});
if (!values.events) {
	console.error("Pass --events FILE (from export-autumn-usage-events.ts)");
	process.exit(64);
}

const events: AutumnUsageEvent[] = readFileSync(values.events, "utf8")
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));
const settledBefore =
	events.reduce((latest, event) => Math.max(latest, event.timestamp), 0) -
	LOCK_SETTLED_MS;

const boots = await db
	.select({
		id: cloudWorkspaceBoots.id,
		memoryMb: cloudWorkspaceBoots.memoryMb,
		startedAt: cloudWorkspaceBoots.startedAt,
		stoppedAt: cloudWorkspaceBoots.stoppedAt,
		finalizedThrough: cloudWorkspaceBoots.finalizedThrough,
		lockSeq: cloudWorkspaceBoots.lockSeq,
		createdByUserId: cloudWorkspaceBoots.createdByUserId,
		workspaceCreator: cloudWorkspaces.createdByUserId,
	})
	.from(cloudWorkspaceBoots)
	.leftJoin(
		cloudWorkspaces,
		eq(cloudWorkspaces.id, cloudWorkspaceBoots.cloudWorkspaceId),
	);
const bootById = new Map(boots.map((boot) => [boot.id, boot]));
const lockKey = (lock: { bootId: string; lockSeq: number; feature: string }) =>
	`${lock.bootId}:${lock.lockSeq}:${lock.feature}`;
const recorded = new Set((await recordedUsage(db)).map(lockKey));
const { locks, untied } = autumnUsageByLock(
	events,
	new Map(boots.map((boot) => [boot.id, boot.lockSeq])),
);

const skipped = {
	recorded: 0,
	unrecorded: 0,
	open: 0,
	notSettled: 0,
	zero: 0,
	negative: 0,
};
const rows: InsertCloudUsageEvent[] = [];
const anomalies = [];
const unrecorded = [];
for (const lock of locks) {
	const boot = bootById.get(lock.bootId);
	if (!boot) throw new Error(`autumnUsageByLock kept unknown ${lock.bootId}`);
	const open =
		boot.stoppedAt === null ||
		boot.finalizedThrough === null ||
		boot.finalizedThrough < boot.stoppedAt;
	if (recorded.has(lockKey(lock))) skipped.recorded += 1;
	else if (lock.lockSeq > boot.lockSeq) {
		skipped.unrecorded += 1;
		unrecorded.push({
			bootId: lock.bootId,
			lockSeq: lock.lockSeq,
			bootLockSeq: boot.lockSeq,
			feature: lock.feature,
			amount: lock.amount,
			lastEventAt: new Date(lock.lastEventAt).toISOString(),
		});
	} else if (open && lock.lockSeq === boot.lockSeq) skipped.open += 1;
	else if (lock.lastEventAt >= settledBefore) skipped.notSettled += 1;
	else if (Math.abs(lock.amount) < HALF_MICRO) skipped.zero += 1;
	else if (lock.amount < 0) skipped.negative += 1;
	else {
		const sentAt = new Date(lock.lastEventAt);
		const box = lock.feature === BOX_GB_MINUTES_FEATURE_ID;
		rows.push({
			bootId: lock.bootId,
			lockSeq: lock.lockSeq,
			feature: lock.feature,
			organizationId: lock.organizationId,
			cloudWorkspaceId: lock.cloudWorkspaceId,
			userId: lock.userId,
			windowFrom: box
				? new Date(
						lock.lastEventAt - (lock.amount / (boot.memoryMb / 1024)) * 60_000,
					)
				: boot.startedAt,
			windowTo: box ? sentAt : (boot.stoppedAt ?? sentAt),
			amount: String(lock.amount),
			sentAt,
		});
	}
	if (lock.events > 2 || lock.amount < -HALF_MICRO) {
		anomalies.push({
			bootId: lock.bootId,
			lockSeq: lock.lockSeq,
			feature: lock.feature,
			events: lock.events,
			amount: lock.amount,
		});
	}
}

const autumnUserByBoot = new Map<string, string>();
for (const lock of [...locks].sort((a, b) => a.lockSeq - b.lockSeq)) {
	if (lock.userId && !autumnUserByBoot.has(lock.bootId)) {
		autumnUserByBoot.set(lock.bootId, lock.userId);
	}
}
const creators = { fromWorkspace: 0, fromAutumn: 0, unknown: 0 };
const creatorUpdates: { id: string; userId: string }[] = [];
for (const boot of boots) {
	if (boot.createdByUserId) continue;
	const userId = boot.workspaceCreator ?? autumnUserByBoot.get(boot.id);
	if (!userId) {
		creators.unknown += 1;
		continue;
	}
	creators[boot.workspaceCreator ? "fromWorkspace" : "fromAutumn"] += 1;
	creatorUpdates.push({ id: boot.id, userId });
}

type Totals = Record<
	string,
	{ rows: number; gbMinutes: number; cpuMinutes: number }
>;
function totalBy(key: (row: InsertCloudUsageEvent) => string): Totals {
	const totals: Totals = {};
	for (const row of rows) {
		const total = totals[key(row)] ?? { rows: 0, gbMinutes: 0, cpuMinutes: 0 };
		totals[key(row)] = total;
		total.rows += 1;
		total[
			row.feature === BOX_GB_MINUTES_FEATURE_ID ? "gbMinutes" : "cpuMinutes"
		] += Number(row.amount);
	}
	return totals;
}
const day = (at: number | Date) => new Date(at).toISOString().slice(0, 10);
const untiedBy: Record<string, { events: number; total: number }> = {};
for (const event of untied) {
	const key = `${event.customerId} ${day(event.timestamp)} ${event.featureId}`;
	const total = untiedBy[key] ?? { events: 0, total: 0 };
	untiedBy[key] = total;
	total.events += 1;
	total.total += event.value;
}

console.log(
	JSON.stringify(
		{
			mode: values.apply ? "apply" : "dry run; pass --apply to write",
			database: new URL(process.env.DATABASE_URL ?? "").host,
			settledBefore: new Date(settledBefore).toISOString(),
			events: events.length,
			locks: locks.length,
			rows: rows.length,
			skipped,
			rowsByOrganization: totalBy((row) => row.organizationId),
			rowsByDay: totalBy((row) => day(row.sentAt as Date)),
			untied: { events: untied.length, byOrganizationDayFeature: untiedBy },
			anomalies: { count: anomalies.length, locks: anomalies },
			unrecordedLocks: { count: unrecorded.length, locks: unrecorded },
			createdByUserId: creators,
		},
		(_, value) =>
			typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value,
		2,
	),
);
if (!values.apply) process.exit(0);

let written = 0;
for (let index = 0; index < rows.length; index += BATCH) {
	const batch = rows.slice(index, index + BATCH);
	const inserted = await db
		.insert(cloudUsageEvents)
		.values(batch)
		.onConflictDoNothing()
		.returning({ bootId: cloudUsageEvents.bootId });
	written += inserted.length;
}
let filled = 0;
for (let index = 0; index < creatorUpdates.length; index += BATCH) {
	const batch = creatorUpdates.slice(index, index + BATCH);
	const updated = await db.execute(sql`
		update ${cloudWorkspaceBoots}
		set created_by_user_id = fill.user_id
		from (values ${sql.join(
			batch.map((update) => sql`(${update.id}, ${update.userId}::uuid)`),
			sql`, `,
		)}) as fill (id, user_id)
		where ${cloudWorkspaceBoots.id} = fill.id
			and ${cloudWorkspaceBoots.createdByUserId} is null`);
	filled += updated.rowCount ?? 0;
}
console.log(JSON.stringify({ written, createdByUserIdFilled: filled }));
