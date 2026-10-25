import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";

const COMPACT_WINDOW_MS = 5 * 60 * 1000;

export type TimelineEntry =
	| { kind: "day"; key: string; date: Date }
	| { kind: "new"; key: string }
	| { kind: "message"; key: string; message: ChannelMessage; compact: boolean };

function dayKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Lays messages out Slack-style: a divider per day, a "New" line before the
 * first message after `lastReadSeq`, and consecutive messages by one author
 * within five minutes drawn compact.
 */
export function groupMessages(
	messages: readonly ChannelMessage[],
	lastReadSeq: number | null,
	currentUserId: string | null,
): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	let previous: ChannelMessage | null = null;
	let markedNew = false;
	for (const message of messages) {
		const day = dayKey(message.createdAt);
		const newDay = !previous || dayKey(previous.createdAt) !== day;
		if (newDay)
			entries.push({ kind: "day", key: `day:${day}`, date: message.createdAt });
		const isNew =
			!markedNew &&
			lastReadSeq !== null &&
			message.seq > lastReadSeq &&
			message.authorUserId !== currentUserId;
		if (isNew) {
			entries.push({ kind: "new", key: "new" });
			markedNew = true;
		}
		const compact =
			!newDay &&
			!isNew &&
			previous !== null &&
			previous.authorUserId === message.authorUserId &&
			previous.deletedAt === null &&
			message.createdAt.getTime() - previous.createdAt.getTime() <
				COMPACT_WINDOW_MS;
		entries.push({ kind: "message", key: message.id, message, compact });
		previous = message;
	}
	return entries;
}
