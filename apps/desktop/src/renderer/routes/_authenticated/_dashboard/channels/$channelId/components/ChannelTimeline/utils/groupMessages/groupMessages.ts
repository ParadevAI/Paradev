import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import { countsAsUnread } from "../../../../utils/unreadState";

const COMPACT_WINDOW_MS = 5 * 60 * 1000;

export type TimelineEntry =
	| { kind: "day"; key: string; date: Date }
	| { kind: "new"; key: string }
	| {
			kind: "message";
			key: string;
			message: ChannelMessage;
			compact: boolean;
			/** For a join or leave: it and the joins and leaves right after it. */
			rollup: ChannelMessage[] | null;
	  };

function dayKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Lays messages out Slack-style: a divider per day, a "New" line before the
 * first unread message, consecutive messages by one author within five
 * minutes drawn compact, and a run of joins and leaves drawn as one row. A
 * Dev's join or leave keeps its own row, as Slack does for apps.
 */
export function groupMessages(
	messages: readonly ChannelMessage[],
	lastReadSeq: number | null,
	currentUserId: string | null,
	isDev: (actorId: string) => boolean = () => false,
): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	let previous: ChannelMessage | null = null;
	let rollup: ChannelMessage[] | null = null;
	let markedNew = false;
	for (const message of messages) {
		if (message.subtype && message.deletedAt) continue;
		const day = dayKey(message.createdAt);
		const newDay = !previous || dayKey(previous.createdAt) !== day;
		if (newDay)
			entries.push({ kind: "day", key: `day:${day}`, date: message.createdAt });
		const isNew =
			!markedNew &&
			lastReadSeq !== null &&
			message.seq > lastReadSeq &&
			countsAsUnread(message, currentUserId);
		if (isNew) {
			entries.push({ kind: "new", key: "new" });
			markedNew = true;
		}
		const fromDev = message.authorId !== null && isDev(message.authorId);
		if (
			message.subtype &&
			rollup &&
			!newDay &&
			!isNew &&
			!fromDev &&
			!isDev(rollup[0]?.authorId ?? "")
		) {
			rollup.push(message);
			previous = message;
			continue;
		}
		rollup = message.subtype ? [message] : null;
		const compact =
			!newDay &&
			!isNew &&
			!message.subtype &&
			previous !== null &&
			!previous.subtype &&
			previous.authorId === message.authorId &&
			previous.deletedAt === null &&
			message.createdAt.getTime() - previous.createdAt.getTime() <
				COMPACT_WINDOW_MS;
		entries.push({
			kind: "message",
			key: message.id,
			message,
			compact,
			rollup,
		});
		previous = message;
	}
	return entries;
}
