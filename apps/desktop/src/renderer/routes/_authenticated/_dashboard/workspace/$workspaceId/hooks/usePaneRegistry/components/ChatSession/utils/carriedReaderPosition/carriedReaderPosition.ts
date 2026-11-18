/**
 * Where the reader was in a chat, kept across an unmount and across a resume
 * that replaces its session. The replacement replays the conversation under
 * new item ids, so the place is told by user message rather than by id.
 */
export type ReaderPosition = {
	userMessagesFromEnd: number;
	messageText: string;
	/** The row at the viewport top, counted from that message. */
	rowsAfterMessage: number;
	/** How far the viewport top is below the top of that row. */
	offsetPx: number;
};

export const MAX_CARRIED_POSITIONS = 50;

const readers = new Map<string, () => ReaderPosition | null>();
const carried = new Map<string, ReaderPosition>();

export function keepReaderPosition(
	sessionId: string,
	position: ReaderPosition | null,
): void {
	carried.delete(sessionId);
	if (!position) return;
	carried.set(sessionId, position);
	for (const oldest of carried.keys()) {
		if (carried.size <= MAX_CARRIED_POSITIONS) break;
		carried.delete(oldest);
	}
}

export function trackReaderPosition(
	sessionId: string,
	read: () => ReaderPosition | null,
): () => void {
	readers.set(sessionId, read);
	return () => {
		if (readers.get(sessionId) === read) readers.delete(sessionId);
	};
}

export function carryReaderPosition(
	fromSessionId: string,
	toSessionId: string,
): void {
	keepReaderPosition(toSessionId, readers.get(fromSessionId)?.() ?? null);
}

export function carriedReaderPosition(
	sessionId: string,
): ReaderPosition | null {
	return carried.get(sessionId) ?? null;
}

export function forgetCarriedReaderPosition(sessionId: string): void {
	carried.delete(sessionId);
}
