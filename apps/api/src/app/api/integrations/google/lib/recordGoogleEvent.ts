import { db } from "@superset/db/client";
import { automationEvents } from "@superset/db/schema";
import { stripNullChars } from "@/lib/strip-null-chars";

/**
 * Records one Google-derived event as an `automation_events` row.
 *
 * Idempotent on (connection, provider, externalEventId): a calendar change
 * seen by two overlapping syncs, or a Pub/Sub redelivery, inserts once and
 * dispatches once. Returns null when the row already existed.
 */
export async function recordGoogleEvent(params: {
	organizationId: string;
	connectionId: string;
	provider: "google_calendar" | "gmail";
	eventType: string;
	externalEventId: string;
	resourceKey: string;
	title: string;
	url: string | null;
	actorLogin: string | null;
	actorIsExternal: boolean | null;
	payload: Record<string, unknown>;
}): Promise<{ eventId: string } | null> {
	const [inserted] = await db
		.insert(automationEvents)
		.values({
			organizationId: params.organizationId,
			integrationConnectionId: params.connectionId,
			provider: params.provider,
			eventType: params.eventType,
			externalEventId: params.externalEventId,
			resourceKey: params.resourceKey,
			title: params.title,
			url: params.url,
			repositoryId: null,
			ref: null,
			actorLogin: params.actorLogin,
			actorIsExternal: params.actorIsExternal,
			payload: stripNullChars(params.payload),
			webhookEventId: null,
		})
		.onConflictDoNothing({
			target: [
				automationEvents.integrationConnectionId,
				automationEvents.provider,
				automationEvents.externalEventId,
			],
		})
		.returning({ id: automationEvents.id });
	return inserted ? { eventId: inserted.id } : null;
}
