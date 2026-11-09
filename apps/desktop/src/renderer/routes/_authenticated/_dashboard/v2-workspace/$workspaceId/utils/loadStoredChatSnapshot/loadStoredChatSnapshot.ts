import {
	emptySnapshot,
	reduceMany,
	type SessionSnapshot,
} from "@superset/chat/core";
import type { Envelope } from "@superset/chat/protocol";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

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

/** A chat as the database holds it, built the way the live chat builds its own. */
export async function loadStoredChatSnapshot(
	chatSessionId: string,
): Promise<SessionSnapshot | null> {
	const envelopes: Envelope[] = [];
	let afterSeq = 0;
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const result = await cloudTrpcClient.chatHistory.events.query({
			chatSessionId,
			afterSeq,
			limit: PAGE_SIZE,
		});
		if (!result.epoch) return null;
		for (const { seq, event } of result.events) {
			envelopes.push({
				v: 1,
				sessionId: chatSessionId,
				ts: 0,
				cursor: { epoch: result.epoch, seq },
				event,
			});
		}
		if (result.nextAfterSeq === null) break;
		afterSeq = result.nextAfterSeq;
	}
	return envelopes.length > 0 ? reduceMany(emptySnapshot(), envelopes) : null;
}
