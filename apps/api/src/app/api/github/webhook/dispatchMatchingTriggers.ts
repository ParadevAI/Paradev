import { dbWs } from "@superset/db/client";
import {
	automations,
	automationTriggers,
	type GithubTriggerConfig,
} from "@superset/db/schema";
import {
	githubEventNames,
	githubTriggerMatches,
	type MatchableEvent,
} from "@superset/shared/automation-matching";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import type { GithubPayload } from "./recordAutomationEvent";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});

/**
 * Fields the matcher needs that are not columns on `automation_events` — they
 * only exist inside the payload, and only for some events.
 */
function matchableFrom(
	payload: GithubPayload,
	eventType: string,
	repositoryId: string | null,
	ref: string | null,
): MatchableEvent {
	return {
		eventType,
		repositoryId,
		ref,
		actorLogin: payload.sender?.login ?? null,
		actorIsExternal: null,
		labels: (payload.pull_request?.labels ?? payload.issue?.labels ?? [])
			.map((l) => l?.name)
			.filter((n): n is string => typeof n === "string"),
		body: payload.comment?.body ?? payload.review?.body ?? null,
		isFork: payload.pull_request?.head?.repo?.fork === true,
		// Who opened the thing being commented on, which is a different person
		// from whoever wrote the comment.
		subjectAuthorLogin:
			payload.pull_request?.user?.login ?? payload.issue?.user?.login ?? null,
	};
}

/**
 * Finds the triggers an event satisfies and enqueues a run for each.
 *
 * Only automations that are enabled are considered — that toggle is the gate a
 * person actually controls, so an automation someone paused stops firing
 * without needing its triggers disabled one by one.
 */
export async function dispatchMatchingTriggers(params: {
	organizationId: string;
	eventId: string;
	eventType: string;
	repositoryId: string | null;
	ref: string | null;
	payload: GithubPayload;
}): Promise<{ matched: number; considered: number }> {
	const names = githubEventNames({
		eventType: params.eventType,
		isDraft: params.payload.pull_request?.draft === true,
		reviewState: params.payload.review?.state ?? null,
		runConclusion: params.payload.workflow_run?.conclusion ?? null,
		threadResolved: null,
	});
	// Nothing in the product names this delivery, so there is nothing to match.
	if (names.length === 0) return { matched: 0, considered: 0 };

	const candidates = await dbWs
		.select({
			triggerId: automationTriggers.id,
			config: automationTriggers.config,
			automationId: automations.id,
			ownerUserId: automations.ownerUserId,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.organizationId, params.organizationId),
				eq(automationTriggers.kind, "github"),
				eq(automationTriggers.enabled, true),
				eq(automations.enabled, true),
			),
		);

	if (candidates.length === 0) return { matched: 0, considered: 0 };

	const event = matchableFrom(
		params.payload,
		params.eventType,
		params.repositoryId,
		params.ref,
	);

	const matched = candidates.filter((candidate) => {
		const config = candidate.config as GithubTriggerConfig;
		if (config.kind !== "github") return false;
		return githubTriggerMatches(
			config as never,
			event,
			// `me` cannot resolve yet: the owner is a Superset user id and the
			// event carries a GitHub login, so there is nothing to compare. Passing
			// null makes `me` match nobody rather than match the wrong person.
			{ names, ownerLogin: null },
		).matches;
	});

	if (matched.length === 0) {
		return { matched: 0, considered: candidates.length };
	}

	await qstash.batchJSON(
		matched.map((candidate) => ({
			url: `${env.NEXT_PUBLIC_API_URL}/api/automations/dispatch/${candidate.automationId}`,
			body: {
				automationId: candidate.automationId,
				triggerId: candidate.triggerId,
				eventId: params.eventId,
			},
			// One run per trigger per event, however many times GitHub redelivers.
			deduplicationId: `${candidate.triggerId}_${params.eventId}`,
			retries: 2,
			failureCallback: `${env.NEXT_PUBLIC_API_URL}/api/automations/run-failed`,
		})),
	);

	return { matched: matched.length, considered: candidates.length };
}
