import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cloudUsageEvents, type InsertCloudUsageEvent } from "./schema/schema";

type Db = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/** Writes one amount sent to Autumn. A retried send of the same window writes nothing. */
export async function recordUsageEvent(
	db: Db,
	event: InsertCloudUsageEvent,
): Promise<void> {
	await db.insert(cloudUsageEvents).values(event).onConflictDoNothing();
}
