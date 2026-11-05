import { readPendingChatStopIds } from "../pendingChatStops";

const closed = new Set<string>(readPendingChatStopIds());
const ignoredTerminals = new Set<string>();

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

/** Sessions on this terminal never get a tab of their own: its tab was closed, or no tab is meant to show it. */
export function ignoreChatTerminal(terminalId: string): () => void {
	ignoredTerminals.add(terminalId);
	return () => ignoredTerminals.delete(terminalId);
}

export function isChatTerminalIgnored(terminalId: string): boolean {
	return ignoredTerminals.has(terminalId);
}
