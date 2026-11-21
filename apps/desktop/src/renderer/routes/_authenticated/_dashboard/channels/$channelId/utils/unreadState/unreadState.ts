import {
	type ChannelMessage,
	PENDING_SEQ,
} from "renderer/routes/_authenticated/utils/channelMessageCache";

export interface UnreadState {
	/** The first message someone else wrote after the read point. */
	firstUnread: ChannelMessage | null;
	unreadCount: number;
	/** The newest confirmed message, which marking read moves the read point to. */
	latestSeq: number | null;
}

/**
 * Slack's rule: posts by someone else count; joins and leaves do not, except
 * the reader being added by someone.
 */
export function countsAsUnread(
	message: ChannelMessage,
	currentUserId: string | null,
): boolean {
	if (!message.subtype) return message.authorId !== currentUserId;
	return (
		message.subtype === "channel_join" &&
		message.inviterId !== null &&
		message.authorId === currentUserId
	);
}

/** Messages after `lastReadSeq` count as unread when `countsAsUnread`, unless deleted. */
export function unreadState(
	messages: readonly ChannelMessage[],
	lastReadSeq: number,
	currentUserId: string | null,
): UnreadState {
	let firstUnread: ChannelMessage | null = null;
	let unreadCount = 0;
	let latestSeq: number | null = null;
	for (const message of messages) {
		if (message.seq === PENDING_SEQ) continue;
		if (latestSeq === null || message.seq > latestSeq) latestSeq = message.seq;
		if (
			message.seq > lastReadSeq &&
			countsAsUnread(message, currentUserId) &&
			message.deletedAt === null
		) {
			unreadCount += 1;
			firstUnread ??= message;
		}
	}
	return { firstUnread, unreadCount, latestSeq };
}
