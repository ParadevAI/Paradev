export function runWorkspaceSearch(run: {
	sessionKind?: string | null;
	chatSessionId: string | null;
	terminalSessionId: string | null;
}): { sessionId?: string; terminalId?: string } {
	return run.sessionKind === "chat" && run.chatSessionId
		? {
				sessionId: run.chatSessionId,
				terminalId: run.terminalSessionId ?? undefined,
			}
		: { terminalId: run.terminalSessionId ?? undefined };
}
