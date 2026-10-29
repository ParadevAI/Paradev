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

export function markCloudChatLaunchClosed(
	workspaceId: string,
	promptHash: string,
): void {
	closed.add(`cloud-launch:${workspaceId}:${promptHash}`);
}

export function reopenCloudChatLaunch(
	workspaceId: string,
	promptHash: string,
): void {
	closed.delete(`cloud-launch:${workspaceId}:${promptHash}`);
}

export function closedCloudChatPromptHashes(workspaceId: string): Set<string> {
	const prefix = `cloud-launch:${workspaceId}:`;
	return new Set(
		[...closed]
			.filter((id) => id.startsWith(prefix))
			.map((id) => id.slice(prefix.length)),
	);
}

const closedTerminals = new Set<string>();

export function markChatTerminalClosed(terminalId: string): () => void {
	closedTerminals.add(terminalId);
	return () => reopenChatTerminal(terminalId);
}

export function reopenChatTerminal(terminalId: string): void {
	closedTerminals.delete(terminalId);
}

export function isChatTerminalClosed(terminalId: string): boolean {
	return closedTerminals.has(terminalId);
}
