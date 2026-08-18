import type { SentryTriggerEvent, TriggerScope } from "../automation-triggers";
import {
	type BaseMatchableEvent,
	type MatchContext,
	type MatchResult,
	scopeAllows,
} from "./core";

/** A Sentry issue webhook, normalized to what Sentry triggers filter on. */
export type SentryMatchableEvent = BaseMatchableEvent & {
	provider: "sentry";
	/** Sentry's numeric project id, as a string. */
	projectId: string | null;
	/** fatal / error / warning / info / debug. */
	level: string | null;
	/** The product-level names this delivery maps to; see sentryEventNames. */
	names: SentryTriggerEvent[];
};

const no = (reason: string): MatchResult => ({ matches: false, reason });

/**
 * Maps a Sentry issue webhook to the events a trigger can name. The wire event
 * is `issue.<action>`; every one of them also satisfies `issue.any`.
 */
export function sentryEventNames(eventType: string): SentryTriggerEvent[] {
	switch (eventType) {
		case "issue.created":
		case "issue.resolved":
		case "issue.assigned":
		case "issue.archived":
		case "issue.unresolved":
			return [eventType, "issue.any"];
		default:
			return [];
	}
}

/** Whether a Sentry trigger config accepts this event. */
export function sentryTriggerMatches(
	config: {
		event: string;
		projects: TriggerScope;
		level: TriggerScope;
	},
	event: SentryMatchableEvent,
	_context: MatchContext,
): MatchResult {
	if (!event.names.includes(config.event as SentryTriggerEvent)) {
		return no("event");
	}
	if (!scopeAllows(config.projects, event.projectId)) {
		return no("project");
	}
	// Level only narrows when configured; null means the trigger author did not
	// choose to filter on it, which for this is "any".
	if (config.level !== null && !scopeAllows(config.level, event.level)) {
		return no("level");
	}
	return { matches: true };
}
