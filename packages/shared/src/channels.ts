export const CHANNEL_NAME_MAX_LENGTH = 80;
export const CHANNEL_DESCRIPTION_MAX_LENGTH = 250;
export const CHANNEL_MESSAGE_MAX_LENGTH = 16_000;
export const CHANNEL_MESSAGES_PAGE_SIZE = 50;
export const CHANNEL_PREVIEW_MAX_LENGTH = 140;

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
export interface ChannelMessageWire {
	id: string;
	channelId: string;
	seq: number;
	threadRootId: string | null;
	authorUserId: string | null;
	body: string;
	mentionedUserIds: string[];
	clientId: string | null;
	replyCount: number;
	lastReplyAt: string | null;
	editedAt: string | null;
	deletedAt: string | null;
	createdAt: string;
}

export type ChannelNotifyReason = "mention" | "reply" | "message";

export type ChannelRealtimeEvent =
	| { type: "channel.message"; channelId: string; message: ChannelMessageWire }
	| { type: "channels.changed"; organizationId: string }
	| { type: "channel.read"; channelId: string; lastReadSeq: number }
	| {
			type: "channel.notify";
			organizationId: string;
			channelId: string;
			channelName: string;
			messageId: string;
			threadRootId: string | null;
			reason: ChannelNotifyReason;
			authorName: string;
			preview: string;
	  };

const EVENT_TYPES = new Set([
	"channel.message",
	"channels.changed",
	"channel.read",
	"channel.notify",
]);

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
	if (typeof event.type !== "string" || !EVENT_TYPES.has(event.type)) {
		return null;
	}
	return value as ChannelRealtimeEvent;
}

/** The signed-in user's own event socket, relative to the realtime origin. */
export const USER_EVENTS_PATH = "/v2/user/events";

/** Where the API publishes events for a set of users. */
export const USERS_PUBLISH_PATH = "/v2/users/publish";

export function previewOf(body: string): string {
	const flat = body.replace(/\s+/g, " ").trim();
	return flat.length > CHANNEL_PREVIEW_MAX_LENGTH
		? `${flat.slice(0, CHANNEL_PREVIEW_MAX_LENGTH - 1)}…`
		: flat;
}
