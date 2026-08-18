import type { SlackEvent } from "@slack/types";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";

import { dispatchMatchingTriggers } from "@/lib/automations/dispatchMatchingTriggers";
import {
	isChannelMessage,
	isMessageReaction,
	normalizeSlackEvent,
	type SlackAutomationEnvelope,
} from "./normalize";
import { recordSlackAutomationEvent } from "./record-automation-event";

export type { SlackAutomationEnvelope } from "./normalize";

/**
 * Whether this delivery is one triggers can name. Narrows the envelope so the
 * route can hand it over without re-checking the event type.
 */
export function isAutomationEvent(envelope: {
	team_id: string;
	event_id: string;
	api_app_id?: string;
	authorizations?: SlackAutomationEnvelope["authorizations"];
	event: SlackEvent;
}): envelope is SlackAutomationEnvelope {
	const { event } = envelope;
	switch (event.type) {
		case "message":
			return isChannelMessage(event, envelope);
		case "reaction_added":
			return isMessageReaction(event, envelope);
		case "channel_created":
			return true;
		default:
			return false;
	}
}

/**
 * Records a Slack event and enqueues a run for every trigger it satisfies.
 *
 * Awaited by the route rather than queued: it is a handful of indexed reads
 * and one insert, well inside Slack's three-second window, and queueing would
 * add a job route only to defer the same work by a few hundred milliseconds.
 */
export async function processAutomationEvent(
	envelope: SlackAutomationEnvelope,
): Promise<
	| { recorded: false; reason: string }
	| { recorded: true; eventId: string; matched: number; considered: number }
> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "slack"),
			eq(integrationConnections.externalOrgId, envelope.team_id),
			isNull(integrationConnections.disconnectedAt),
		),
		columns: { id: true, organizationId: true },
	});
	if (!connection) return { recorded: false, reason: "unknown workspace" };

	const normalized = normalizeSlackEvent(envelope.event);
	const recorded = await recordSlackAutomationEvent({
		organizationId: connection.organizationId,
		integrationConnectionId: connection.id,
		envelope,
		normalized,
	});
	if ("duplicate" in recorded) {
		return { recorded: false, reason: "duplicate delivery" };
	}

	const result = await dispatchMatchingTriggers({
		organizationId: connection.organizationId,
		eventId: recorded.eventId,
		event: normalized.event,
	});
	return { recorded: true, eventId: recorded.eventId, ...result };
}
