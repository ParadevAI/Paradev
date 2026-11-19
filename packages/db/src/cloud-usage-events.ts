import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "./cloud-usage-query";
import {
	cloudUsageEvents,
	cloudWorkspaceBoots,
	type InsertCloudUsageEvent,
} from "./schema/schema";
import type { PendingUsageEvent } from "./schema/types";

/** Writes one amount sent to Autumn. A retried send of the same window writes nothing. */
export async function recordUsageEvent(
	db: Db,
	event: InsertCloudUsageEvent,
): Promise<void> {
	await db.insert(cloudUsageEvents).values(event).onConflictDoNothing();
}

type Same<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Assert<T extends true> = T;
type Flat<T> = { [K in keyof T]: T[K] };

/** Fails to compile when PendingUsageEvent no longer matches a cloud_usage_events row. */
export type PendingUsageEventMatchesRow = Assert<
	Same<
		PendingUsageEvent,
		Flat<
			Omit<
				InsertCloudUsageEvent,
				"windowFrom" | "windowTo" | "sentAt" | "createdAt" | "updatedAt"
			> & { windowFrom: string; windowTo: string; sentAt: string }
		>
	>
>;

export function usageRowFromPending(
	event: PendingUsageEvent,
): InsertCloudUsageEvent {
	return {
		...event,
		windowFrom: new Date(event.windowFrom),
		windowTo: new Date(event.windowTo),
		sentAt: new Date(event.sentAt),
	};
}

/**
 * Every usage row we hold for an amount Autumn accepted: the written rows and the ones kept on a
 * boot until the meter writes them. A lock with either has its row, so a backfill must not add one.
 */
export function recordedUsage(db: Db) {
	const pending = sql`(${cloudWorkspaceBoots} cross join jsonb_array_elements(${cloudWorkspaceBoots.pendingUsageEvents}) as pending(event))`;
	return db
		.select({
			bootId: cloudUsageEvents.bootId,
			lockSeq: cloudUsageEvents.lockSeq,
			feature: sql<string>`${cloudUsageEvents.feature}::text`.as("feature"),
			amount: cloudUsageEvents.amount,
			sentAt: cloudUsageEvents.sentAt,
		})
		.from(cloudUsageEvents)
		.unionAll(
			db
				.select({
					bootId: sql<string>`pending.event->>'bootId'`,
					lockSeq: sql<number>`(pending.event->>'lockSeq')::int`,
					feature: sql<string>`pending.event->>'feature'`,
					amount: sql<string>`(pending.event->>'amount')::numeric`,
					sentAt: sql<Date | null>`(pending.event->>'sentAt')::timestamptz`,
				})
				.from(pending)
				.where(isNotNull(cloudWorkspaceBoots.pendingUsageEvents)),
		);
}

/** Clears a boot's kept rows only if the list is still the one written, so a row a settle added meanwhile stays. */
export async function clearPendingUsage(
	db: Db,
	bootId: string,
	written: PendingUsageEvent[],
): Promise<boolean> {
	const cleared = await db
		.update(cloudWorkspaceBoots)
		.set({ pendingUsageEvents: null })
		.where(
			and(
				eq(cloudWorkspaceBoots.id, bootId),
				sql`${cloudWorkspaceBoots.pendingUsageEvents} = ${JSON.stringify(written)}::jsonb`,
			),
		)
		.returning({ id: cloudWorkspaceBoots.id });
	return cleared.length > 0;
}
