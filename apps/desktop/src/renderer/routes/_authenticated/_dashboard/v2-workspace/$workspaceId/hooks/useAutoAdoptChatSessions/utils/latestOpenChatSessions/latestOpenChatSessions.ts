interface ChatSessionRow {
	sessionId: string;
	harnessSessionId: string | null;
	terminalId: string | null;
	live: boolean;
	closedAt?: number | null;
	updatedAt: number;
}

export function latestOpenChatSessions<Session extends ChatSessionRow>(
	sessions: readonly Session[],
	attached: ReadonlySet<string>,
): Session[] {
	const conversations = Map.groupBy(
		sessions,
		(session) => session.harnessSessionId ?? session.sessionId,
	);
	return [...conversations.values()].flatMap((rows) => {
		const isAttached = rows.some(
			(row) =>
				attached.has(row.sessionId) ||
				(row.terminalId !== null && attached.has(row.terminalId)),
		);
		if (isAttached) return [];
		const latest = rows.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
		if (latest.closedAt) return [];
		// Hosts older than closedAt omit it; only their live sessions are safe to open.
		return latest.live || latest.closedAt === null ? [latest] : [];
	});
}
