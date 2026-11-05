import { readPendingChatStopIds } from "../pendingChatStops";

const closed = new Set<string>(readPendingChatStopIds());

export function markChatSessionClosed(sessionId: string): () => void {
	closed.add(sessionId);
	return () => reopenChatSession(sessionId);
}

export function reopenChatSession(sessionId: string): void {
	closed.delete(sessionId);
}

export function isChatSessionClosed(sessionId: string): boolean {
	return closed.has(sessionId);
}
