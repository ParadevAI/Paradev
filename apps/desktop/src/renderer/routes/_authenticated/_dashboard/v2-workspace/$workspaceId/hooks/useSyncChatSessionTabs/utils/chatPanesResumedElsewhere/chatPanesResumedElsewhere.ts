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
 * Panes whose chat the host closed when another device resumed its agent
 * session, with the newest open chat on that session to show instead.
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
	const chatPanes = tabs.flatMap((tab) =>
		Object.values(tab.panes).flatMap((pane) =>
			pane.kind === "chat-v3"
				? [{ id: pane.id, data: pane.data as ChatPaneData }]
				: [],
		),
	);
	const paneTerminalIds = new Set(
		chatPanes.map((pane) => pane.data.terminalId),
	);
	return chatPanes.flatMap(({ id, data }) => {
		const shown = data.sessionId ? sessionsById.get(data.sessionId) : undefined;
		if (!shown?.closedAt || shown.closedByUser === true || data.awaitingMove)
			return [];
		const key = agentSessionKey(shown);
		const resumed = key ? resumedBy.get(key) : undefined;
		if (!resumed || resumed.sessionId === shown.sessionId) return [];
		if (resumed.terminalId && paneTerminalIds.has(resumed.terminalId))
			return [];
		return [{ paneId: id, sessionId: resumed.sessionId }];
	});
}
