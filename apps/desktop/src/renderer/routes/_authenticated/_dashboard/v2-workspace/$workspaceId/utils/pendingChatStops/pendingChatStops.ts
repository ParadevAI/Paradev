const STORAGE_KEY = "pending-chat-stops-v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingChatStop {
	workspaceId: string;
	sessionId: string;
	closedAt: number;
}

function read(): PendingChatStop[] {
	try {
		const parsed: unknown = JSON.parse(
			localStorage.getItem(STORAGE_KEY) ?? "[]",
		);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(entry: PendingChatStop) => Date.now() - entry.closedAt < MAX_AGE_MS,
		);
	} catch {
		return [];
	}
}

function write(entries: PendingChatStop[]): void {
	try {
		if (entries.length === 0) localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
	} catch (error) {
		console.warn("[acp-chat] could not save pending chat stops", error);
	}
}

export function readPendingChatStopIds(): string[] {
	return read().map((entry) => entry.sessionId);
}

export function readPendingChatStops(workspaceId: string): string[] {
	return read()
		.filter((entry) => entry.workspaceId === workspaceId)
		.map((entry) => entry.sessionId);
}

export function addPendingChatStop(
	workspaceId: string,
	sessionId: string,
): void {
	write([
		...read().filter((entry) => entry.sessionId !== sessionId),
		{ workspaceId, sessionId, closedAt: Date.now() },
	]);
}

export function removePendingChatStop(sessionId: string): void {
	write(read().filter((entry) => entry.sessionId !== sessionId));
}
