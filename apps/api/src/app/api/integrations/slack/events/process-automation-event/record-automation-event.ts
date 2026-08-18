import { db } from "@superset/db/client";
import { automationEvents } from "@superset/db/schema";

import { stripNullChars } from "@/lib/strip-null-chars";
import type {
	NormalizedSlackEvent,
	SlackAutomationEnvelope,
} from "./normalize";

/**
 * Records a Slack event as an `automation_events` row — the normalized stream
 * triggers are matched against. Idempotent on Slack's `event_id`: a retried
 * delivery is the same event, and the first one already dispatched.
 */
export async function recordSlackAutomationEvent(params: {
	organizationId: string;
	integrationConnectionId: string;
	envelope: SlackAutomationEnvelope;
	normalized: NormalizedSlackEvent;
}): Promise<{ eventId: string } | { duplicate: true }> {
	const { normalized } = params;
	const [inserted] = await db
		.insert(automationEvents)
		.values({
			organizationId: params.organizationId,
			integrationConnectionId: params.integrationConnectionId,
			provider: "slack",
			eventType: normalized.event.eventType,
			externalEventId: params.envelope.event_id,
			resourceKey: normalized.resourceKey,
			title: normalized.title,
			url: normalized.url,
			repositoryId: null,
			ref: null,
			actorLogin: normalized.event.actorLogin,
			actorIsExternal: null,
			// jsonb rejects U+0000, and a payload carrying one would otherwise
			// throw and lose the event.
			payload: stripNullChars(params.envelope) as Record<string, unknown>,
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

	if (!inserted) return { duplicate: true };
	return { eventId: inserted.id };
}
