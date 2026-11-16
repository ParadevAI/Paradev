import type { Tab } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import type { ListedChatSession } from "../chatSessionsToAdopt";

type ResumableChatSession = Pick<
	ListedChatSession,
	| "sessionId"
	| "harness"
	| "harnessSessionId"
	| "updatedAt"
	| "live"
	| "closedAt"
	| "closedByUser"
	| "terminalId"
>;

function agentSessionKey(session: ResumableChatSession): string | null {
	return session.harnessSessionId
		? `${session.harness}:${session.harnessSessionId}`
		: null;
}

/**
 * Chat panes whose chat the host closed because another device resumed its
 * agent session under a new chat, such as mobile, with the chat to show
 * instead: the newest open chat on that agent session. A chat on the pane's
 * own terminal is the pane's own recovery, which the pane commits itself.
 */
export function chatPanesResumedElsewhere(
	sessions: readonly ResumableChatSession[],
	tabs: readonly Tab<PaneViewerData>[],
): Array<{ paneId: string; sessionId: string }> {
	const sessionsById = new Map(
		sessions.map((session) => [session.sessionId, session]),
	);
	const resumedBy = new Map<string, ResumableChatSession>();
	for (const session of sessions) {
		const key = agentSessionKey(session);
		const open =
			session.live || (!session.closedAt && session.closedByUser !== true);
		if (!key || !open) continue;
		const newest = resumedBy.get(key);
		if (!newest || session.updatedAt > newest.updatedAt)
			resumedBy.set(key, session);
	}
	if (resumedBy.size === 0) return [];
	return tabs.flatMap((tab) =>
		Object.values(tab.panes).flatMap((pane) => {
			if (pane.kind !== "chat-v3") return [];
			const { sessionId, terminalId, awaitingMove } = pane.data as ChatPaneData;
			const shown = sessionId ? sessionsById.get(sessionId) : undefined;
			if (!shown?.closedAt || shown.closedByUser === true || awaitingMove)
				return [];
			const key = agentSessionKey(shown);
			const resumed = key ? resumedBy.get(key) : undefined;
			if (!resumed || resumed.sessionId === shown.sessionId) return [];
			if (resumed.terminalId === terminalId) return [];
			return [{ paneId: pane.id, sessionId: resumed.sessionId }];
		}),
	);
}
