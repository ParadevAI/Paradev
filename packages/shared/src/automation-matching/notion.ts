import type {
	NotionTriggerEvent,
	TriggerActor,
	TriggerConfigInput,
	TriggerScope,
} from "../automation-triggers";
import {
	actorAllows,
	type BaseMatchableEvent,
	type MatchContext,
	type MatchResult,
	scopeAllows,
} from "./core";

/**
 * A Notion delivery, normalized to what Notion triggers filter on. The
 * delivery itself carries only ids; everything here comes from the webhook
 * route fetching the entity it names.
 */
export type NotionMatchableEvent = BaseMatchableEvent & {
	provider: "notion";
	/** The data source the page belongs to, or the data source itself. */
	dataSourceId: string | null;
	/** The page a comment sits on. Null for data source events. */
	pageId: string | null;
	/** Users @-mentioned in a comment's rich text. Empty for other events. */
	mentionedUserIds: string[];
};

const no = (reason: string): MatchResult => ({ matches: false, reason });

/**
 * Maps a Notion delivery to the events a trigger names. A comment that
 * mentions someone is both a comment and a mention.
 */
export function notionEventNames(eventType: string): NotionTriggerEvent[] {
	switch (eventType) {
		case "data_source.content_updated":
			return ["data_source.content_updated"];
		case "comment.created":
			return ["comment.created", "comment.mentioned"];
		default:
			return [];
	}
}

/** Whether a Notion trigger config accepts this event. */
export function notionTriggerMatches(
	config: Extract<TriggerConfigInput, { kind: "notion" }>,
	event: NotionMatchableEvent,
	context: MatchContext,
): MatchResult {
	if (!notionEventNames(event.eventType).includes(config.event)) {
		return no("event");
	}
	if (!scopeAllows(config.dataSources, event.dataSourceId)) {
		return no("dataSource");
	}
	// Pages only narrow when configured; null means the author did not choose
	// to filter on them, which here is "any".
	const pages: TriggerScope | undefined =
		"pages" in config ? config.pages : undefined;
	if (
		pages !== undefined &&
		pages !== null &&
		!scopeAllows(pages, event.pageId)
	) {
		return no("page");
	}
	if (
		"actor" in config &&
		!actorAllows(config.actor, event.actorId, context.ownerIds)
	) {
		return no("actor");
	}
	if ("mentionedUser" in config) {
		const mentionedUser: TriggerActor = config.mentionedUser;
		// A comment that mentions nobody is not a mention, whoever the trigger
		// is watching for.
		if (event.mentionedUserIds.length === 0) return no("mention");
		if (
			!event.mentionedUserIds.some((id) =>
				actorAllows(mentionedUser, id, context.ownerIds),
			)
		) {
			return no("mentionedUser");
		}
	}
	return { matches: true };
}
