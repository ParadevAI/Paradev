import type { AgentTurnStatus } from "@superset/db/enums";
import {
	type ChannelMessage,
	PENDING_SEQ,
} from "renderer/routes/_authenticated/utils/channelMessageCache";

/** How far apart the coordinator's copy and the channel's copy of one message can be. */
export const POSTED_WINDOW_MS = 10 * 60_000;
/** How long a Dev may take to pick a message up before the wait reads as a miss. */
export const PICKUP_GRACE_MS = 45_000;

/**
 * The channel message the person's words were posted as, so the Devs they
 * named could answer: theirs, top level, the same text, nearest in time. A
 * chat replayed after a restart stamps its messages with the replay time, so
 * with nothing near, the newest earlier copy stands in.
 */
export function postedRoot(
	messages: readonly ChannelMessage[],
	post: { authorId: string; text: string; at: number },
): ChannelMessage | null {
	const text = post.text.trim();
	let nearest: ChannelMessage | null = null;
	let nearestGap = Number.POSITIVE_INFINITY;
	let earlier: ChannelMessage | null = null;
	for (const message of messages) {
		if (
			message.authorId !== post.authorId ||
			message.threadRootId !== null ||
			message.deletedAt !== null ||
			message.body.trim() !== text
		) {
			continue;
		}
		const at = message.createdAt.getTime();
		const gap = Math.abs(at - post.at);
		if (gap <= POSTED_WINDOW_MS && gap < nearestGap) {
			nearest = message;
			nearestGap = gap;
		}
		if (at <= post.at && (!earlier || at > earlier.createdAt.getTime())) {
			earlier = message;
		}
	}
	return nearest ?? earlier;
}

export function isSaved(message: ChannelMessage): boolean {
	return message.seq !== PENDING_SEQ;
}

export type DevPickupState =
	| "answered"
	| "answering"
	| "quiet"
	| "failed"
	| "missed";

/**
 * Where a Dev stands on a message that named it: it answered in the thread,
 * is still on it, finished without a word, failed, or never picked it up.
 */
export function devPickupState({
	devId,
	replies,
	turnStatus,
	busy,
	postedAt,
	now,
}: {
	devId: string;
	replies: readonly ChannelMessage[];
	/** The Dev's turn for this thread, if one started. */
	turnStatus: AgentTurnStatus | null;
	/** The Dev is on another turn, so this one waits in its queue. */
	busy: boolean;
	postedAt: number;
	now: number;
}): DevPickupState {
	if (replies.some((reply) => reply.authorId === devId)) return "answered";
	switch (turnStatus) {
		case "running":
		case "queued":
			return "answering";
		case "completed":
			return "quiet";
		case "failed":
		case "interrupted":
			return "failed";
		case null:
			return busy || now - postedAt < PICKUP_GRACE_MS ? "answering" : "missed";
	}
}
