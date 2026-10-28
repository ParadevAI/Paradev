import type {
	ChannelAttachment,
	ChannelBroadcast,
	ChannelMessageWire,
} from "@superset/shared/channels";
import type { RouterOutputs } from "@superset/trpc";

export type ChannelMessage =
	RouterOutputs["channelMessage"]["list"]["messages"][number];
export type ChannelMessagePage = RouterOutputs["channelMessage"]["list"];
export type ChannelThread = RouterOutputs["channelMessage"]["thread"];

/** A message the composer sent that the API has not confirmed yet. */
export const PENDING_SEQ = Number.MAX_SAFE_INTEGER;

export function fromWire(wire: ChannelMessageWire): ChannelMessage {
	return {
		...wire,
		subtype: wire.subtype ?? null,
		inviterId: wire.inviterId ?? null,
		lastReplyAt: wire.lastReplyAt ? new Date(wire.lastReplyAt) : null,
		editedAt: wire.editedAt ? new Date(wire.editedAt) : null,
		deletedAt: wire.deletedAt ? new Date(wire.deletedAt) : null,
		createdAt: new Date(wire.createdAt),
	};
}

export function pendingMessage(input: {
	channelId: string;
	authorId: string;
	body: string;
	clientId: string;
	threadRootId: string | null;
	mentionedIds: string[];
	broadcast?: ChannelBroadcast | null;
	/** Local previews of the files on their way up. */
	attachments?: ChannelAttachment[];
}): ChannelMessage {
	return {
		id: input.clientId,
		channelId: input.channelId,
		seq: PENDING_SEQ,
		threadRootId: input.threadRootId,
		authorId: input.authorId,
		body: input.body,
		subtype: null,
		inviterId: null,
		mentionedIds: input.mentionedIds,
		broadcast: input.broadcast ?? null,
		clientId: input.clientId,
		replyCount: 0,
		lastReplyAt: null,
		editedAt: null,
		deletedAt: null,
		createdAt: new Date(),
		reactions: [],
		attachments: input.attachments ?? [],
	};
}

function sameMessage(a: ChannelMessage, b: ChannelMessage): boolean {
	return a.id === b.id || (a.clientId !== null && a.clientId === b.clientId);
}

/** Inserts or replaces `message` in a list kept in seq order. */
export function upsertMessage(
	list: readonly ChannelMessage[],
	message: ChannelMessage,
): ChannelMessage[] {
	const next = list.filter((entry) => !sameMessage(entry, message));
	next.push(message);
	return next.sort((a, b) => a.seq - b.seq);
}

export function removeMessage(
	list: readonly ChannelMessage[],
	id: string,
): ChannelMessage[] {
	return list.filter((entry) => entry.id !== id);
}

/**
 * Pages come newest first: page 0 holds the latest messages, later pages
 * older ones. A known message is replaced where it is; a newer one joins
 * page 0; an unknown older one sits in a page not loaded yet and is skipped.
 */
export function upsertIntoPages(
	pages: readonly ChannelMessagePage[],
	message: ChannelMessage,
): ChannelMessagePage[] {
	const index = pages.findIndex((page) =>
		page.messages.some((entry) => sameMessage(entry, message)),
	);
	if (index === -1) {
		const newest = pages[0]?.messages.findLast(
			(entry) => entry.seq !== PENDING_SEQ,
		);
		if (newest && message.seq < newest.seq) return [...pages];
	}
	const target = index === -1 ? 0 : index;
	return pages.map((page, i) =>
		i === target
			? { ...page, messages: upsertMessage(page.messages, message) }
			: page,
	);
}
