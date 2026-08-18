import type {
	MicrosoftTeamsTriggerEvent,
	TriggerActor,
	TriggerScope,
} from "../automation-triggers";
import {
	actorAllows,
	type BaseMatchableEvent,
	bodyMatches,
	type MatchContext,
	type MatchResult,
	scopeAllows,
} from "./core";

/**
 * A Teams change notification, resolved to the resource behind it and
 * normalized to what Teams triggers filter on. `body` is the message text for
 * a message and the new channel's name for a channel.
 */
export type MicrosoftTeamsMatchableEvent = BaseMatchableEvent & {
	provider: "microsoft_teams";
	eventType: MicrosoftTeamsTriggerEvent;
	teamId: string | null;
	channelId: string | null;
};

const no = (reason: string): MatchResult => ({ matches: false, reason });

/** Whether a Teams trigger config accepts this event. */
export function microsoftTeamsTriggerMatches(
	config: {
		event: MicrosoftTeamsTriggerEvent;
		teams: TriggerScope;
		channels: TriggerScope;
		actor: TriggerActor;
		messageFilter?: { pattern: string; isRegex: boolean } | null;
	},
	event: MicrosoftTeamsMatchableEvent,
	context: MatchContext,
): MatchResult {
	if (event.eventType !== config.event) return no("event");
	if (!scopeAllows(config.teams, event.teamId)) return no("team");

	// For channel_created the channel is the subject, not a filter, and nobody
	// is named as the actor: the sentence has neither slot.
	if (config.event === "message_in_channel") {
		if (!scopeAllows(config.channels, event.channelId)) return no("channel");
		if (!actorAllows(config.actor, event.actorId, context.ownerIds)) {
			return no("actor");
		}
	}

	if (!bodyMatches(config.messageFilter ?? null, event.body)) {
		return no("messageFilter");
	}
	return { matches: true };
}
