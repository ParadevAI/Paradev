import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { db } from "@superset/db/client";
import {
	type AutumnUsageEvent,
	autumnUsageByLock,
} from "@superset/db/cloud-usage-autumn";
import {
	cloudUsageEvents,
	cloudWorkspaceBoots,
	cloudWorkspaces,
	type InsertCloudUsageEvent,
} from "@superset/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Fills cloud_usage_events from what Autumn already holds for the boots metered before the meter
 * wrote rows (M5a), and created_by_user_id on boots made before authorizeBoot wrote it.
 *
 * A row is Autumn's net for one lock: the sum of its events per boot, lock sequence and feature.
 * Its sent_at and window_to are the lock's last event; window_from is window_to less the amount
 * at the boot's GB. An event that cannot be tied to a boot is reported, not written.
 *
 * Reports what it would do unless `--apply` is passed. Safe to run again: it sets each row and
 * never adds, it skips locks with an event at or after --before (the meter writes those) and
 * locks still open, and it never changes a row sent at or after --before.
 *
 * Usage: bun run packages/trpc/scripts/backfill-cloud-usage-events.ts \
 *   --events FILE --before ISO_TIMESTAMP [--apply]
 */

const BATCH = 500;
const HALF_MICRO = 0.0000005;

const { values } = parseArgs({
	options: {
		events: { type: "string" },
		before: { type: "string" },
		apply: { type: "boolean", default: false },
	},
});
const before = Date.parse(values.before ?? "");
if (
	!values.events ||
	!Number.isFinite(before) ||
	!/(Z|[+-]\d{2}:\d{2})$/.test(values.before ?? "")
) {
	console.error(
		"Pass --events FILE and --before ISO_TIMESTAMP with a timezone (when M5a was deployed)",
	);
	process.exit(64);
}

const events: AutumnUsageEvent[] = readFileSync(values.events, "utf8")
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));

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
const { locks, untied } = autumnUsageByLock(
	events,
	new Map(boots.map((boot) => [boot.id, boot.lockSeq])),
);

const skipped = { open: 0, atOrAfterBefore: 0, zero: 0, negative: 0 };
const rows: InsertCloudUsageEvent[] = [];
const anomalies = [];
for (const lock of locks) {
	const boot = bootById.get(lock.bootId);
	if (!boot) throw new Error(`autumnUsageByLock kept unknown ${lock.bootId}`);
	const open =
		boot.stoppedAt === null ||
		boot.finalizedThrough === null ||
		boot.finalizedThrough < boot.stoppedAt;
	if (open && lock.lockSeq === boot.lockSeq) skipped.open += 1;
	else if (lock.lastEventAt >= before) skipped.atOrAfterBefore += 1;
	else if (Math.abs(lock.amount) < HALF_MICRO) skipped.zero += 1;
	else if (lock.amount < 0) skipped.negative += 1;
	else {
		const sentAt = new Date(lock.lastEventAt);
		const box = lock.feature === "box_gb_minutes";
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
		total[row.feature === "box_gb_minutes" ? "gbMinutes" : "cpuMinutes"] +=
			Number(row.amount);
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
			before: new Date(before).toISOString(),
			events: events.length,
			locks: locks.length,
			rows: rows.length,
			skipped,
			rowsByOrganization: totalBy((row) => row.organizationId),
			rowsByDay: totalBy((row) => day(row.sentAt as Date)),
			untied: { events: untied.length, byOrganizationDayFeature: untiedBy },
			anomalies: { count: anomalies.length, locks: anomalies },
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
	await db
		.insert(cloudUsageEvents)
		.values(batch)
		.onConflictDoUpdate({
			target: [
				cloudUsageEvents.bootId,
				cloudUsageEvents.lockSeq,
				cloudUsageEvents.feature,
			],
			set: {
				organizationId: sql`excluded.organization_id`,
				cloudWorkspaceId: sql`excluded.cloud_workspace_id`,
				userId: sql`excluded.user_id`,
				windowFrom: sql`excluded.window_from`,
				windowTo: sql`excluded.window_to`,
				amount: sql`excluded.amount`,
				sentAt: sql`excluded.sent_at`,
			},
			setWhere: sql`${cloudUsageEvents.sentAt} < ${new Date(before)}`,
		});
	written += batch.length;
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
