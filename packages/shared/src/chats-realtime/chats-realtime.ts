import { signClaims, verifyClaims } from "../usercontent/ticket";

/** `GET <path>/<channel>?since=<seq>`: a client's websocket for one channel. */
export const CHATS_REALTIME_PATH = "/v2/chats/realtime";
/** `POST` with `{ channel, data, ephemeral? }`: the API's events. */
export const CHATS_PUBLISH_PATH = "/v2/chats/publish";

/** The websocket subprotocol a client offers next to its ticket; the channel answers with it. */
export const CHATS_REALTIME_PROTOCOL = "chats-realtime";

/** How long a ticket opens its channels; the client fetches a new one before then. */
export const CHATS_REALTIME_TICKET_SECONDS = 10 * 60;

const CHANNEL =
	/^(user|group):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Channels the API publishes to: a person's own (`user:<id>`) and each group's (`group:<id>`). */
export const isChatsChannel = (name: string) => CHANNEL.test(name);

export const chatsUserChannel = (userId: string) => `user:${userId}`;
export const chatsGroupChannel = (groupId: string) => `group:${groupId}`;

/** What a verified ticket allows: listen on these channels until `exp` (seconds since the epoch). */
export interface ChatsRealtimeGrant {
	userId: string;
	channels: string[];
	exp: number;
}

const KIND = "chats-realtime";

export function signChatsRealtimeTicket(
	secret: string,
	grant: ChatsRealtimeGrant,
): Promise<string> {
	return signClaims(secret, { kind: KIND, ...grant });
}

export async function verifyChatsRealtimeTicket(
	secrets: string | readonly string[],
	ticket: string,
	now: number = Date.now(),
): Promise<ChatsRealtimeGrant | null> {
	const wire = await verifyClaims(secrets, ticket, now);
	if (!wire) return null;
	const { kind, userId, channels, exp } = wire as {
		kind?: unknown;
		userId?: unknown;
		channels?: unknown;
		exp: number;
	};
	if (
		kind !== KIND ||
		typeof userId !== "string" ||
		!Array.isArray(channels) ||
		!channels.every(
			(channel): channel is string =>
				typeof channel === "string" && isChatsChannel(channel),
		)
	) {
		return null;
	}
	return { userId, channels, exp };
}

/**
 * Browsers cannot set headers on a websocket and URLs end up in logs, so the
 * ticket travels as a subprotocol: `Sec-WebSocket-Protocol: chats-realtime, <ticket>`.
 */
export function chatsTicketFromProtocols(header: string | null): string | null {
	const offered = (header ?? "")
		.split(",")
		.map((protocol) => protocol.trim())
		.filter(Boolean);
	if (!offered.includes(CHATS_REALTIME_PROTOCOL)) return null;
	return (
		offered.find((protocol) => protocol !== CHATS_REALTIME_PROTOCOL) ?? null
	);
}
