import {
	emptySnapshot,
	reduceMany,
	type SessionSnapshot,
} from "@superset/chat/core";
import type { Envelope } from "@superset/chat/protocol";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

const truncatedSnapshots = new WeakSet<SessionSnapshot>();
const truncatedChats = new Set<string>();

/** Whether a stored chat had more history than was loaded. */
export function isTruncatedStoredChat(
	chatSessionId: string,
	snapshot: SessionSnapshot,
): boolean {
	return truncatedChats.has(chatSessionId) || truncatedSnapshots.has(snapshot);
}

/** Shared by every view of one stored chat, so the next one shows it from cache. */
export function storedChatSnapshotKey(chatSessionId: string | null) {
	return ["stored-chat-snapshot", chatSessionId] as const;
}

/**
 * The stored chat a sleeping workspace showed last. A woken box resumes a chat
 * as a new session with the same history, so the pane shows this one until its
 * own arrives.
 */
export function shownStoredChatKey(workspaceId: string) {
	return ["stored-chat-shown", workspaceId] as const;
}

/**
 * A chat as the database holds it, built the way the live chat builds its own.
 * A long chat keeps its newest events, the part a person reads first.
 */
export async function loadStoredChatSnapshot(
	chatSessionId: string,
): Promise<SessionSnapshot | null> {
	const pages: Envelope[][] = [];
	let beforeSeq: number | undefined;
	let more = false;
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const result = await cloudTrpcClient.chatHistory.events.query({
			chatSessionId,
			latest: true,
			beforeSeq,
			limit: PAGE_SIZE,
		});
		const epoch = result.epoch;
		if (!epoch) return null;
		pages.unshift(
			result.events.map(({ seq, event }) => ({
				v: 1,
				sessionId: chatSessionId,
				ts: 0,
				cursor: { epoch, seq },
				event,
			})),
		);
		if (result.nextBeforeSeq === null) {
			more = false;
			break;
		}
		more = true;
		beforeSeq = result.nextBeforeSeq;
	}
	const envelopes = pages.flat();
	if (envelopes.length === 0) return null;
	const snapshot = reduceMany(emptySnapshot(), envelopes);
	if (more) {
		truncatedSnapshots.add(snapshot);
		truncatedChats.add(chatSessionId);
	} else {
		truncatedChats.delete(chatSessionId);
	}
	return snapshot;
}
