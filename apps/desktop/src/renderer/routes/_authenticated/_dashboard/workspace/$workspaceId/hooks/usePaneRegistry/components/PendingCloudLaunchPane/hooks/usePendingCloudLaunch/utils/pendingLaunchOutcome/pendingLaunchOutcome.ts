import type { CloudAgentLaunchSurface } from "@superset/shared/cloud-agent-launch";

export interface LaunchedChatSession {
	sessionId: string;
	terminalId: string | null;
	/** The terminal it launched under, kept after the harness stops. Older hosts omit it. */
	launchTerminalId?: string | null;
	harnessSessionId: string | null;
	title: string | null;
	live: boolean;
	closedAt?: number | null;
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
	answeredAtMs,
	nowMs,
	timeoutMs,
	noAnswerTimeoutMs,
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
	/** When the host first answered the session lists; null until it has. */
	answeredAtMs: number | null;
	nowMs: number;
	timeoutMs: number;
	/** How long to wait for the host's first answer, from provisioning. */
	noAnswerTimeoutMs: number;
}): PendingLaunchOutcome {
	const giveUp = givingUpOutcome(surface);
	if (!terminalId) return giveUp;
	const session = launchedChat(sessions, terminalId, terminalBinding);
	if (session) return { kind: "chat", session };
	if (launchedInTerminal(surface, terminalListed, terminalBinding))
		return typed ? { kind: "release" } : { kind: "terminal" };
	const untilMs =
		answeredAtMs === null
			? sinceMs + noAnswerTimeoutMs
			: Math.max(sinceMs, answeredAtMs) + timeoutMs;
	return nowMs >= untilMs ? giveUp : { kind: "wait", untilMs };
}

/**
 * The chat the launch started, live or not: a harness that finished or a box
 * that slept leaves the session behind, and the user came for its transcript.
 */
function launchedChat(
	sessions: readonly LaunchedChatSession[],
	terminalId: string,
	terminalBinding: { chatSessionId?: string | null } | undefined,
): LaunchedChatSession | undefined {
	const bound = terminalBinding?.chatSessionId;
	const launched = sessions.filter(
		(candidate) =>
			(candidate.terminalId ?? candidate.launchTerminalId) === terminalId ||
			candidate.sessionId === bound,
	);
	return (
		launched.find((candidate) => candidate.live) ??
		launched.find((candidate) => !candidate.closedAt) ??
		launched[0]
	);
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
