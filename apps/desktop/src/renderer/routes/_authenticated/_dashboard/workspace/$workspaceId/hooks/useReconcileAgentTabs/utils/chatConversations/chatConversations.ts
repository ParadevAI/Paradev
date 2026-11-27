export interface ListedChatSession {
	sessionId: string;
	harness: string;
	harnessSessionId: string | null;
	title: string | null;
	updatedAt: number;
	live: boolean;
	terminalId: string | null;
	launchTerminalId?: string | null;
	closedAt?: number | null;
	closedByUser?: boolean;
}

export interface ChatConversation {
	key: string;
	sessionIds: string[];
	current: ListedChatSession;
	open: boolean;
	updatedAt: number;
}

export function chatConversationKey(session: ListedChatSession): string {
	return session.terminalId ?? session.launchTerminalId ?? session.sessionId;
}

export function isChatSessionOpen(session: ListedChatSession): boolean {
	return session.live || (!session.closedAt && session.closedByUser !== true);
}

export function chatConversations(
	sessions: readonly ListedChatSession[],
): ChatConversation[] {
	const byKey = new Map<string, ListedChatSession[]>();
	for (const session of sessions) {
		const key = chatConversationKey(session);
		byKey.set(key, [...(byKey.get(key) ?? []), session]);
	}
	return [...byKey].map(([key, rows]) => {
		const newestFirst = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
		const current =
			newestFirst.find((row) => row.live) ??
			(newestFirst[0] as ListedChatSession);
		return {
			key,
			sessionIds: rows.map((row) => row.sessionId),
			current,
			open: isChatSessionOpen(current),
			updatedAt: Math.max(...rows.map((row) => row.updatedAt)),
		};
	});
}
