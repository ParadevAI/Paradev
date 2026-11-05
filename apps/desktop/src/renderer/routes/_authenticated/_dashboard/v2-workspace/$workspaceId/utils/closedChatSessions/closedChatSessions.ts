import { readPendingChatStopIds } from "../pendingChatStops";

const closed = new Set<string>(readPendingChatStopIds());
const reopened = new Set<string>();
const ignoredTerminals = new Set<string>();

export function markChatSessionClosed(sessionId: string): () => void {
	closed.add(sessionId);
	reopened.delete(sessionId);
	return () => reopenChatSession(sessionId);
}

export function reopenChatSession(sessionId: string): void {
	closed.delete(sessionId);
	reopened.add(sessionId);
}

export function isChatSessionClosed(sessionId: string): boolean {
	return closed.has(sessionId);
}

/** Opened on purpose in this window (history, a link, Undo), so a close elsewhere does not take it away. */
export function isChatSessionReopened(sessionId: string): boolean {
	return reopened.has(sessionId);
}

/** Sessions on this terminal never get a tab of their own: its tab was closed, or no tab is meant to show it. */
export function ignoreChatTerminal(terminalId: string): () => void {
	ignoredTerminals.add(terminalId);
	return () => ignoredTerminals.delete(terminalId);
}

export function isChatTerminalIgnored(terminalId: string): boolean {
	return ignoredTerminals.has(terminalId);
}
