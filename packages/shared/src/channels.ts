export const CHANNEL_NAME_MAX_LENGTH = 80;
export const CHANNEL_DESCRIPTION_MAX_LENGTH = 250;
export const CHANNEL_MESSAGE_MAX_LENGTH = 16_000;
export const CHANNEL_MESSAGES_PAGE_SIZE = 50;
export const CHANNEL_NOTIFICATION_TEXT_MAX_LENGTH = 2_000;

/** Lowercase letters, digits, dashes and underscores, as Slack names channels. */
export const CHANNEL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function normalizeChannelName(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9_-]/g, "")
		.replace(/^[-_]+/, "")
		.slice(0, CHANNEL_NAME_MAX_LENGTH);
}

/** A message as it crosses the realtime socket: dates as ISO strings. */
export interface ChannelReaction {
	/** Slack shortcode, `+1::skin-tone-3` for a toned one. */
	emoji: string;
	/** People and Devs who reacted. */
	actorIds: string[];
}

export interface ChannelAttachment {
	id: string;
	name: string;
	contentType: string;
	/** A short-lived signed link. */
	url: string;
}

export type ChannelBroadcast = "here" | "channel" | "everyone";

export type ChannelMessageSubtype = "channel_join" | "channel_leave";

export const CHANNEL_BROADCASTS: readonly ChannelBroadcast[] = [
	"here",
	"channel",
	"everyone",
];

export interface ChannelMessageWire {
	id: string;
	channelId: string;
	seq: number;
	threadRootId: string | null;
	/** A person's user id or a Dev's agent id. */
	authorId: string | null;
	body: string;
	/** Set when the author joined or left; the body is then only a fallback. */
	subtype: ChannelMessageSubtype | null;
	/** Who added or removed the author. */
	inviterId: string | null;
	/** The people and Devs the message mentions. */
	mentionedIds: string[];
	broadcast: ChannelBroadcast | null;
	clientId: string | null;
	replyCount: number;
	lastReplyAt: string | null;
	editedAt: string | null;
	deletedAt: string | null;
	createdAt: string;
	reactions: ChannelReaction[];
	attachments: ChannelAttachment[];
}

/** `here` is an @here: the client drops it while its person is away. */
export type ChannelNotifyReason = "mention" | "here" | "reply" | "message";

export type ChannelRealtimeEvent =
	| { type: "channel.message"; channelId: string; message: ChannelMessageWire }
	| { type: "channels.changed"; organizationId: string }
	| { type: "agents.changed"; organizationId: string; agentId: string }
	| { type: "channel.tasks"; channelId: string }
	| {
			type: "channel.read";
			channelId: string;
			lastReadSeq: number;
			hasUnread: boolean;
			mentionCount: number;
	  }
	| {
			type: "channel.thread.read";
			channelId: string;
			rootId: string;
			lastReadSeq: number;
			following: boolean;
	  }
	| {
			type: "channel.notify";
			organizationId: string;
			organizationName: string;
			channelId: string;
			channelName: string;
			messageId: string;
			threadRootId: string | null;
			reason: ChannelNotifyReason;
			authorName: string;
			/** Empty when `showPreview` is off. */
			preview: string;
			showPreview: boolean;
	  };

const EVENT_TYPES: Record<ChannelRealtimeEvent["type"], true> = {
	"channel.message": true,
	"channels.changed": true,
	"agents.changed": true,
	"channel.tasks": true,
	"channel.read": true,
	"channel.thread.read": true,
	"channel.notify": true,
};

export function parseChannelRealtimeEvent(
	raw: unknown,
): ChannelRealtimeEvent | null {
	let value: unknown = raw;
	if (typeof raw === "string") {
		try {
			value = JSON.parse(raw);
		} catch {
			return null;
		}
	}
	if (typeof value !== "object" || value === null) return null;
	const event = value as { type?: unknown };
	if (
		typeof event.type !== "string" ||
		!Object.hasOwn(EVENT_TYPES, event.type)
	) {
		return null;
	}
	return value as ChannelRealtimeEvent;
}

/** The signed-in user's own event socket, relative to the realtime origin. */
export const USER_EVENTS_PATH = "/v2/user/events";

/** Where the API publishes events for a set of users. */
export const USERS_PUBLISH_PATH = "/v2/users/publish";

const MARKDOWN_TO_TEXT: [RegExp, string][] = [
	[/^```[^\n]*\n?|\n?```$/gm, ""],
	[/!\[([^\]]*)\]\([^)]*\)/g, "$1"],
	[/\[([^\]]+)\]\([^)]*\)/g, "$1"],
	[/<(https?:\/\/[^>]+)>/g, "$1"],
	[/`([^`\n]+)`/g, "$1"],
	[/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2"],
	[/~~(?=\S)([\s\S]*?\S)~~/g, "$1"],
	[/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, "$1$2"],
	[/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2"],
	[/^#{1,6}\s+/gm, ""],
	[/^\s*>\s?/gm, ""],
	[/^(\s*)[-*+]\s+(\[[ x]\]\s+)?/gm, "$1• "],
	[/\\([\\`*_{}[\]()#+\-.!~>|])/g, "$1"],
	[/\n{3,}/g, "\n\n"],
];

/**
 * A message as plain text for a notification, the way Slack's banners show
 * it: formatting marks and link targets removed, line breaks kept.
 */
export function notificationTextOf(body: string): string {
	let text = body;
	for (const [pattern, replacement] of MARKDOWN_TO_TEXT) {
		text = text.replace(pattern, replacement);
	}
	text = text.trim();
	return text.length > CHANNEL_NOTIFICATION_TEXT_MAX_LENGTH
		? `${text.slice(0, CHANNEL_NOTIFICATION_TEXT_MAX_LENGTH - 1)}…`
		: text;
}
