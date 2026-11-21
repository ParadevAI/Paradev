import type { CloudAgentLaunchSurface } from "@superset/shared/cloud-agent-launch";

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
	| { kind: "drop" }
	| { kind: "wait"; untilMs: number };

/**
 * What a pending cloud launch pane becomes: the chat or terminal its launch
 * started under the promised terminal id, or, once it can no longer arrive,
 * a plain chat (chat surface) or nothing (terminal surface).
 */
export function pendingLaunchOutcome({
	surface,
	terminalId,
	sessions,
	terminalListed,
	terminalBinding,
	typed,
	sinceMs,
	nowMs,
	timeoutMs,
}: {
	surface: CloudAgentLaunchSurface;
	terminalId: string | undefined;
	sessions: readonly LaunchedChatSession[];
	/** `terminalId` is in the host's terminal list. */
	terminalListed: boolean;
	/** The agent binding on `terminalId`, live or ended. */
	terminalBinding: { chatSessionId?: string | null } | undefined;
	typed: boolean;
	sinceMs: number;
	nowMs: number;
	timeoutMs: number;
}): PendingLaunchOutcome {
	const giveUp = givingUpOutcome(surface);
	if (!terminalId) return giveUp;
	const session = sessions.find(
		(candidate) => candidate.live && candidate.terminalId === terminalId,
	);
	if (session) return { kind: "chat", session };
	if (launchedInTerminal(surface, terminalListed, terminalBinding))
		return typed ? { kind: "release" } : { kind: "terminal" };
	const untilMs = sinceMs + timeoutMs;
	return nowMs >= untilMs ? giveUp : { kind: "wait", untilMs };
}

function launchedInTerminal(
	surface: CloudAgentLaunchSurface,
	terminalListed: boolean,
	terminalBinding: { chatSessionId?: string | null } | undefined,
): boolean {
	if (terminalBinding && !terminalBinding.chatSessionId) return true;
	switch (surface) {
		case "terminal":
			return terminalListed;
		case "chat":
			// A chat launch hands its id to the chat runtime, not to a listed terminal.
			return false;
		default:
			return surface satisfies never;
	}
}

function givingUpOutcome(
	surface: CloudAgentLaunchSurface,
): PendingLaunchOutcome {
	switch (surface) {
		case "chat":
			return { kind: "release" };
		case "terminal":
			return { kind: "drop" };
		default:
			return surface satisfies never;
	}
}
