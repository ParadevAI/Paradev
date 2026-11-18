import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { db } from "@superset/db/client";
import {
	type AutumnUsageEvent,
	autumnUsageByLock,
} from "@superset/db/cloud-usage-autumn";
import { cloudUsageEvents, cloudWorkspaceBoots } from "@superset/db/schema";
import { and, isNull, lt } from "drizzle-orm";

/**
 * Check 3 of the cost and health design, once, as a script: for every boot closed before the
 * export, each cloud_usage_events row against Autumn's events summed per boot, lock sequence and
 * feature, both ways; and every row with no sent_at older than one hour. Read-only.
 *
 * Exits 1 when anything differs.
 *
 * Usage: bun run packages/trpc/scripts/check-cloud-usage-events.ts --events FILE
 */

const TOLERANCE = 0.000001;
const SETTLE_LAG_MS = 10 * 60 * 1000;
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
				boot.finalizedThrough >= boot.stoppedAt &&
				boot.stoppedAt.getTime() < exportedThrough - SETTLE_LAG_MS,
		)
		.map((boot) => boot.id),
);
const { locks } = autumnUsageByLock(
	events,
	new Map(boots.map((boot) => [boot.id, boot.lockSeq])),
);
const key = (row: { bootId: string; lockSeq: number; feature: string }) =>
	`${row.bootId}:${row.lockSeq}:${row.feature}`;
const autumn = new Map(
	locks
		.filter((lock) => closed.has(lock.bootId))
		.map((lock) => [key(lock), lock.amount]),
);
const ours = new Map(
	(
		await db
			.select({
				bootId: cloudUsageEvents.bootId,
				lockSeq: cloudUsageEvents.lockSeq,
				feature: cloudUsageEvents.feature,
				amount: cloudUsageEvents.amount,
			})
			.from(cloudUsageEvents)
	)
		.filter((row) => closed.has(row.bootId))
		.map((row) => [key(row), Number(row.amount)]),
);

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
