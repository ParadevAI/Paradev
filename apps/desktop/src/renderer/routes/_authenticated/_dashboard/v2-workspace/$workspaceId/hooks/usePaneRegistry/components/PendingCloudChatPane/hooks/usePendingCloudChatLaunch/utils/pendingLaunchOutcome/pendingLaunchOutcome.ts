export interface LaunchedChatSession {
	sessionId: string;
	terminalId: string | null;
	harnessSessionId: string | null;
	title: string | null;
	live: boolean;
}

export type PendingLaunchOutcome =
	| { kind: "chat"; session: LaunchedChatSession }
	| { kind: "terminal" }
	| { kind: "release" }
	| { kind: "wait"; untilMs: number };

/**
 * What a pending cloud chat pane becomes: the chat or terminal its launch
 * started under the promised terminal id, or a plain chat once it can no
 * longer arrive.
 */
export function pendingLaunchOutcome({
	terminalId,
	sessions,
	launchedTerminal,
	typed,
	sinceMs,
	nowMs,
	timeoutMs,
}: {
	terminalId: string | undefined;
	sessions: readonly LaunchedChatSession[];
	/** The launch ran in a terminal: a live agent with no chat holds `terminalId`. */
	launchedTerminal: boolean;
	typed: boolean;
	sinceMs: number;
	nowMs: number;
	timeoutMs: number;
}): PendingLaunchOutcome {
	if (!terminalId) return { kind: "release" };
	const session = sessions.find(
		(candidate) => candidate.live && candidate.terminalId === terminalId,
	);
	if (session) return { kind: "chat", session };
	if (launchedTerminal)
		return typed ? { kind: "release" } : { kind: "terminal" };
	const untilMs = sinceMs + timeoutMs;
	return nowMs >= untilMs ? { kind: "release" } : { kind: "wait", untilMs };
}
