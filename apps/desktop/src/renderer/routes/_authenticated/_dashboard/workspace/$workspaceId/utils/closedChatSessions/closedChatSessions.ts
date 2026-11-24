import { readPendingChatStopIds } from "../pendingChatStops";

const MAX_REMEMBERED = 500;

const closed = new Set<string>(readPendingChatStopIds());
const reopened = new Set<string>();
const ignoredTerminals = new Set<string>();

/** Oldest entries go first: by then their chats were stopped long ago. */
function remember(set: Set<string>, value: string): void {
	set.delete(value);
	set.add(value);
	if (set.size <= MAX_REMEMBERED) return;
	const oldest = set.values().next().value;
	if (oldest !== undefined) set.delete(oldest);
}

export function markChatSessionClosed(sessionId: string): () => void {
	remember(closed, sessionId);
	reopened.delete(sessionId);
	return () => reopenChatSession(sessionId);
}

export function reopenChatSession(sessionId: string): void {
	closed.delete(sessionId);
	remember(reopened, sessionId);
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
	remember(ignoredTerminals, terminalId);
	return () => ignoredTerminals.delete(terminalId);
}

export function isChatTerminalIgnored(terminalId: string): boolean {
	return ignoredTerminals.has(terminalId);
}
