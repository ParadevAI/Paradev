import { readPendingChatStopIds } from "../pendingChatStops";

const closed = new Set<string>(readPendingChatStopIds());
const closedTerminals = new Set<string>();

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

export function markChatTerminalClosed(terminalId: string): () => void {
	closedTerminals.add(terminalId);
	return () => closedTerminals.delete(terminalId);
}

export function isChatTerminalClosed(terminalId: string): boolean {
	return closedTerminals.has(terminalId);
}
