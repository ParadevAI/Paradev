import { db } from "@superset/db/client";
import { automationEvents } from "@superset/db/schema";
import {
	type SentryMatchableEvent,
	sentryEventNames,
} from "@superset/shared/automation-matching";

import { stripNullChars } from "@/lib/strip-null-chars";

/**
 * Records a Sentry issue webhook as an `automation_events` row.
 *
 * Same role as the GitHub recorder: the normalized stream triggers are matched
 * against, keeping its own copy of the payload and flattening the fields the
 * matcher and a prompt need. Sentry payloads have one shape for every issue
 * action, so there is much less to flatten.
 */

/** The parts of a Sentry issue webhook this route reads. */
export type SentryIssuePayload = {
	action?: string;
	// installation.created carries the grant code; every delivery carries the
	// uuid, which is how the webhook route finds the connection.
	installation?: { uuid?: string };
	data?: {
		installation?: { uuid?: string };
		issue?: {
			id?: string | number;
			shortId?: string;
			title?: string;
			web_url?: string;
			permalink?: string;
			level?: string;
			project?: { id?: string | number; slug?: string; name?: string };
		};
	};
	actor?: { type?: string; id?: string | number; name?: string };
};

function projectIdFor(payload: SentryIssuePayload): string | null {
	const id = payload.data?.issue?.project?.id;
	// The numeric id, not the slug: a project can be renamed and triggers must
	// keep matching it afterwards.
	return id !== undefined ? String(id) : null;
}

/**
 * Normalizes an issue webhook into what Sentry triggers filter on. Sentry
 * triggers have no person filter, so the actor is display-only: a person is
 * worth naming, Sentry itself (which resolves and archives) is not.
 */
export function matchableFrom(
	payload: SentryIssuePayload,
	eventType: string,
): SentryMatchableEvent {
	const actor = payload.actor;
	const person = actor?.type === "user";
	return {
		provider: "sentry",
		eventType,
		names: sentryEventNames(eventType),
		projectId: projectIdFor(payload),
		level: payload.data?.issue?.level ?? null,
		actorId: person && actor.id !== undefined ? String(actor.id) : null,
		actorLogin: person ? (actor.name ?? null) : null,
		body: null,
	};
}

/**
 * The issue a run would act on. Runs key debounce and in-flight limits off
 * this, so a resolve and an unresolve of one issue are the same resource.
 */
function resourceKeyFor(payload: SentryIssuePayload): string | null {
	const project = projectIdFor(payload);
	const issue = payload.data?.issue?.id;
	if (!project || issue === undefined) return null;
	return `sentry:${project}#${issue}`;
}

function titleFor(payload: SentryIssuePayload, eventType: string): string {
	return (
		payload.data?.issue?.title ?? payload.data?.issue?.shortId ?? eventType
	);
}

export async function recordAutomationEvent(params: {
	organizationId: string;
	connectionId: string;
	event: SentryMatchableEvent;
	deliveryId: string;
	payload: SentryIssuePayload;
}): Promise<{ recorded: boolean; reason?: string; eventId?: string }> {
	const { payload, event } = params;

	const [inserted] = await db
		.insert(automationEvents)
		.values({
			organizationId: params.organizationId,
			integrationConnectionId: params.connectionId,
			provider: "sentry",
			eventType: event.eventType,
			externalEventId: params.deliveryId,
			resourceKey: resourceKeyFor(payload),
			title: titleFor(payload, event.eventType),
			url:
				payload.data?.issue?.web_url ?? payload.data?.issue?.permalink ?? null,
			repositoryId: null,
			ref: null,
			actorLogin: event.actorLogin,
			actorIsExternal: null,
			// jsonb rejects NUL, and a payload carrying one would otherwise throw
			// and lose the event.
			payload: stripNullChars(payload) as Record<string, unknown>,
			webhookEventId: null,
		})
		// A redelivery of the same Sentry request id is the same event.
		.onConflictDoNothing({
			target: [
				automationEvents.integrationConnectionId,
				automationEvents.provider,
				automationEvents.externalEventId,
			],
		})
		.returning({ id: automationEvents.id });

	// Empty on a redelivery the dedupe swallowed; the first delivery already
	// dispatched whatever this event matches.
	if (!inserted) return { recorded: false, reason: "duplicate delivery" };

	return { recorded: true, eventId: inserted.id };
}
