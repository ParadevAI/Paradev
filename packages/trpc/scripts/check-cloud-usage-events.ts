import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { db } from "@superset/db/client";
import {
	type AutumnUsageEvent,
	autumnUsageByLock,
	LOCK_SETTLED_MS,
} from "@superset/db/cloud-usage-autumn";
import { cloudUsageEvents, cloudWorkspaceBoots } from "@superset/db/schema";
import { and, isNull, lt } from "drizzle-orm";

/**
 * Check 3 of the cost and health design, once, as a script: for every closed boot, our rows
 * against Autumn's events, each summed per boot, lock sequence and feature, both ways; and every
 * row with no sent_at older than one hour. A lock is compared once its last event and its rows are
 * LOCK_SETTLED_MS older than the export, so a refund still to come is not a difference. Read-only.
 *
 * Exits 1 when anything differs.
 *
 * Usage: bun run packages/trpc/scripts/check-cloud-usage-events.ts --events FILE
 */

const TOLERANCE = 0.000001;
const UNSENT_AFTER_MS = 60 * 60 * 1000;
const LISTED = 50;

const { values } = parseArgs({ options: { events: { type: "string" } } });
if (!values.events) {
	console.error("Pass --events FILE (from export-autumn-usage-events.ts)");
	process.exit(64);
}
const events: AutumnUsageEvent[] = readFileSync(values.events, "utf8")
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));
const exportedThrough = events.reduce(
	(latest, event) => Math.max(latest, event.timestamp),
	0,
);

const boots = await db
	.select({
		id: cloudWorkspaceBoots.id,
		stoppedAt: cloudWorkspaceBoots.stoppedAt,
		finalizedThrough: cloudWorkspaceBoots.finalizedThrough,
		lockSeq: cloudWorkspaceBoots.lockSeq,
	})
	.from(cloudWorkspaceBoots);
const closed = new Set(
	boots
		.filter(
			(boot) =>
				boot.stoppedAt !== null &&
				boot.finalizedThrough !== null &&
				boot.finalizedThrough >= boot.stoppedAt,
		)
		.map((boot) => boot.id),
);
const { locks } = autumnUsageByLock(
	events,
	new Map(boots.map((boot) => [boot.id, boot.lockSeq])),
);
const key = (row: { bootId: string; lockSeq: number; feature: string }) =>
	`${row.bootId}:${row.lockSeq}:${row.feature}`;
const settledBefore = exportedThrough - LOCK_SETTLED_MS;
const unsettled = new Set<string>();
const autumn = new Map<string, number>();
for (const lock of locks) {
	if (!closed.has(lock.bootId)) continue;
	autumn.set(key(lock), lock.amount);
	if (lock.lastEventAt >= settledBefore) unsettled.add(key(lock));
}
const ours = new Map<string, number>();
for (const row of await db
	.select({
		bootId: cloudUsageEvents.bootId,
		lockSeq: cloudUsageEvents.lockSeq,
		feature: cloudUsageEvents.feature,
		amount: cloudUsageEvents.amount,
		sentAt: cloudUsageEvents.sentAt,
	})
	.from(cloudUsageEvents)) {
	if (!closed.has(row.bootId)) continue;
	ours.set(key(row), (ours.get(key(row)) ?? 0) + Number(row.amount));
	if (!row.sentAt || row.sentAt.getTime() >= settledBefore) {
		unsettled.add(key(row));
	}
}
for (const lock of unsettled) {
	autumn.delete(lock);
	ours.delete(lock);
}

const onlyOurs: string[] = [];
const amountDiffers: { lock: string; ours: number; autumn: number }[] = [];
for (const [lock, amount] of ours) {
	const autumnAmount = autumn.get(lock);
	if (autumnAmount === undefined) onlyOurs.push(lock);
	else if (Math.abs(amount - autumnAmount) > TOLERANCE) {
		amountDiffers.push({ lock, ours: amount, autumn: autumnAmount });
	}
}
const onlyAutumn = [...autumn]
	.filter(([lock, amount]) => !ours.has(lock) && Math.abs(amount) > TOLERANCE)
	.map(([lock]) => lock);
const unsent = await db
	.select({
		bootId: cloudUsageEvents.bootId,
		lockSeq: cloudUsageEvents.lockSeq,
		feature: cloudUsageEvents.feature,
		createdAt: cloudUsageEvents.createdAt,
	})
	.from(cloudUsageEvents)
	.where(
		and(
			isNull(cloudUsageEvents.sentAt),
			lt(cloudUsageEvents.createdAt, new Date(Date.now() - UNSENT_AFTER_MS)),
		),
	);

const failed =
	onlyOurs.length + onlyAutumn.length + amountDiffers.length + unsent.length;
console.log(
	JSON.stringify(
		{
			result: failed === 0 ? "pass" : "fail",
			database: new URL(process.env.DATABASE_URL ?? "").host,
			exportedThrough: new Date(exportedThrough).toISOString(),
			closedBoots: closed.size,
			unsettledLocks: unsettled.size,
			locks: { ours: ours.size, autumn: autumn.size },
			onlyOurs: { count: onlyOurs.length, first: onlyOurs.slice(0, LISTED) },
			onlyAutumn: {
				count: onlyAutumn.length,
				first: onlyAutumn.slice(0, LISTED),
			},
			amountDiffers: {
				count: amountDiffers.length,
				first: amountDiffers.slice(0, LISTED),
			},
			unsentOlderThanAnHour: {
				count: unsent.length,
				first: unsent.slice(0, LISTED),
			},
		},
		null,
		2,
	),
);
process.exit(failed === 0 ? 0 : 1);
