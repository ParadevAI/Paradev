import type { Db } from "./cloud-usage-query";
import { cloudUsageEvents, type InsertCloudUsageEvent } from "./schema/schema";

/** Writes one amount sent to Autumn. A retried send of the same window writes nothing. */
export async function recordUsageEvent(
	db: Db,
	event: InsertCloudUsageEvent,
): Promise<void> {
	await db.insert(cloudUsageEvents).values(event).onConflictDoNothing();
}
