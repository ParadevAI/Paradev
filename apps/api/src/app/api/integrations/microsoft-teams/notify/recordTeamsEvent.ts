import { db } from "@superset/db/client";
import { automationEvents } from "@superset/db/schema";

import { stripNullChars } from "@/lib/strip-null-chars";

/**
 * Records one Teams notification, resolved to the resource behind it, as an
 * `automation_events` row.
 *
 * The payload stored is what Graph returned for the resource, not the
 * notification — the notification is a pointer, and a prompt built from a
 * pointer would have nothing to say. Idempotent on the resource id within
 * the connection: Graph retries deliveries it did not get a 2xx for.
 */
export async function recordTeamsEvent(params: {
	organizationId: string;
	connectionId: string;
	eventType: "message_in_channel" | "channel_created";
	externalEventId: string;
	resourceKey: string;
	title: string;
	url: string | null;
	actorLogin: string | null;
	payload: Record<string, unknown>;
}): Promise<{ recorded: true; eventId: string } | { recorded: false }> {
	const [inserted] = await db
		.insert(automationEvents)
		.values({
			organizationId: params.organizationId,
			integrationConnectionId: params.connectionId,
			provider: "microsoft_teams",
			eventType: params.eventType,
			externalEventId: params.externalEventId,
			resourceKey: params.resourceKey,
			title: params.title,
			url: params.url,
			repositoryId: null,
			ref: null,
			actorLogin: params.actorLogin,
			actorIsExternal: null,
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

	if (!inserted) return { recorded: false };
	return { recorded: true, eventId: inserted.id };
}
