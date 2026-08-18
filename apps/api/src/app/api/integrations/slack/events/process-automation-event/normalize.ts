import type {
	BotMessageEvent,
	ChannelCreatedEvent,
	FileShareMessageEvent,
	GenericMessageEvent,
	MessageEvent,
	ReactionAddedEvent,
	ThreadBroadcastMessageEvent,
} from "@slack/types";
import {
	type SlackMatchableEvent,
	slackEventNames,
} from "@superset/shared/automation-matching";

/**
 * The message subtypes that are still "a message in the channel". Edits,
 * deletes, joins and topic changes are also delivered as `message` events and
 * are not.
 */
export type ChannelMessageEvent =
	| GenericMessageEvent
	| BotMessageEvent
	| FileShareMessageEvent
	| ThreadBroadcastMessageEvent;

/**
 * The three Slack events triggers can name, and the envelope they arrive in.
 * The envelope's `authorizations` names the bot user the event was delivered
 * for, which is how the bot's own messages are recognised without a lookup.
 */
export type SlackAutomationEvent =
	| ChannelMessageEvent
	| ReactionAddedEvent
	| ChannelCreatedEvent;

export type SlackAutomationEnvelope = {
	team_id: string;
	event_id: string;
	api_app_id?: string;
	authorizations?: Array<{ user_id?: string; is_bot?: boolean }>;
	event: SlackAutomationEvent;
};

/**
 * A Slack event flattened out of payloads whose shape differs per event: the
 * matchable event triggers filter on, plus what the `automation_events` row
 * needs beyond that.
 */
export type NormalizedSlackEvent = {
	event: SlackMatchableEvent;
	resourceKey: string;
	title: string;
	url: string;
};

const MESSAGE_SUBTYPES = new Set<string | undefined>([
	undefined,
	"bot_message",
	"file_share",
	"thread_broadcast",
]);

/**
 * Whether a message event is one triggers should see: posted in a channel
 * (public or private, not a DM), a real post rather than an edit, and not
 * written by this app's own bot — an automation that replies in Slack must not
 * wake itself up.
 */
export function isChannelMessage(
	event: MessageEvent,
	envelope: Pick<SlackAutomationEnvelope, "api_app_id" | "authorizations">,
): event is ChannelMessageEvent {
	// The union's members disagree on which of these they carry; read them
	// loosely and let the subtype allow-list do the narrowing.
	const message = event as {
		subtype?: string;
		channel_type?: string;
		user?: string;
		bot_profile?: { app_id?: string };
	};
	if (message.channel_type !== "channel" && message.channel_type !== "group") {
		return false;
	}
	if (!MESSAGE_SUBTYPES.has(message.subtype)) return false;
	const ownBotUserIds = (envelope.authorizations ?? [])
		.map((a) => a.user_id)
		.filter((id): id is string => typeof id === "string");
	if (message.user && ownBotUserIds.includes(message.user)) return false;
	if (
		envelope.api_app_id !== undefined &&
		message.bot_profile?.app_id === envelope.api_app_id
	) {
		return false;
	}
	return true;
}

/** Slack's canonical permalink; slack.com redirects to the workspace domain. */
function permalink(channel: string, ts: string): string {
	return `https://slack.com/archives/${channel}/p${ts.replace(".", "")}`;
}

/** `:bug::skin-tone-2:` arrives as `bug::skin-tone-2`; the trigger names `bug`. */
export function reactionName(reaction: string): string {
	return reaction.split("::")[0] ?? reaction;
}

const MAX_TITLE = 120;

function titleFromText(text: string | undefined, fallback: string): string {
	const firstLine = (text ?? "").split("\n").find((line) => line.trim());
	if (!firstLine) return fallback;
	const trimmed = firstLine.trim();
	return trimmed.length > MAX_TITLE
		? `${trimmed.slice(0, MAX_TITLE - 1)}…`
		: trimmed;
}

function matchable(
	eventType: "message" | "reaction_added" | "channel_created",
	fields: Pick<
		SlackMatchableEvent,
		"channelId" | "actorId" | "body" | "reaction" | "isThreadReply"
	>,
): SlackMatchableEvent {
	return {
		provider: "slack",
		eventType,
		names: slackEventNames(eventType),
		// Slack events carry the user id and no handle; a lookup per message is
		// not worth a display column.
		actorLogin: fields.actorId,
		...fields,
	};
}

export function normalizeSlackEvent(
	event: SlackAutomationEvent,
): NormalizedSlackEvent {
	switch (event.type) {
		case "message": {
			// A thread is one resource: replies key on the root, so a run in
			// flight on a thread debounces its own follow-ups.
			const root = event.thread_ts ?? event.ts;
			return {
				event: matchable("message", {
					channelId: event.channel,
					actorId: event.user ?? null,
					body: event.text ?? null,
					reaction: null,
					// A reply carries its root's ts; a root's thread_ts, when set,
					// is its own ts.
					isThreadReply:
						event.thread_ts !== undefined && event.thread_ts !== event.ts,
				}),
				resourceKey: `slack:${event.channel}:${root}`,
				title: titleFromText(event.text, `Message in ${event.channel}`),
				url: permalink(event.channel, event.ts),
			};
		}
		case "reaction_added":
			return {
				event: matchable("reaction_added", {
					channelId: event.item.channel,
					actorId: event.user ?? null,
					body: null,
					reaction: reactionName(event.reaction),
					isThreadReply: false,
				}),
				resourceKey: `slack:${event.item.channel}:${event.item.ts}`,
				title: `:${reactionName(event.reaction)}: reaction`,
				url: permalink(event.item.channel, event.item.ts),
			};
		case "channel_created":
			return {
				event: matchable("channel_created", {
					channelId: null,
					actorId: event.channel.creator ?? null,
					// The name is what a "matching" filter reads.
					body: event.channel.name ?? null,
					reaction: null,
					isThreadReply: false,
				}),
				resourceKey: `slack:${event.channel.id}`,
				title: `#${event.channel.name}`,
				url: `https://slack.com/archives/${event.channel.id}`,
			};
	}
}
