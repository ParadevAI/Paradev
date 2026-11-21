interface ListedChatSession {
	sessionId: string;
	terminalId: string | null;
	live: boolean;
}

export function findStrayChatSessions<TSession extends ListedChatSession>(
	sessions: readonly TSession[],
	terminalId: string,
	keptSessionIds: ReadonlySet<string>,
): TSession[] {
	return sessions.filter(
		(session) =>
			session.live &&
			session.terminalId === terminalId &&
			!keptSessionIds.has(session.sessionId),
	);
}
