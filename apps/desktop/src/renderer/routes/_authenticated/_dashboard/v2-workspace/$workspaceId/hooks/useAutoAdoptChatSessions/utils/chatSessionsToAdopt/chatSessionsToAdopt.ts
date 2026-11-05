import { presetForAcpHarness } from "@superset/chat/core";
import type { Tab } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import { isChatSessionClosed } from "../../../../utils/closedChatSessions";
import type { ChatSessionTarget } from "../../../../utils/focusChatSession";

interface ListedChatSession {
	sessionId: string;
	harness: string;
	harnessSessionId: string | null;
	title: string | null;
	updatedAt: number;
	live: boolean;
	terminalId: string | null;
}

/**
 * Live chats in the workspace that no pane shows, oldest first. A pane
 * claims a chat by its session id or by its terminal id, so a chat the
 * desktop is still creating (or a pending cloud launch) is never adopted twice.
 */
export function chatSessionsToAdopt(
	sessions: readonly ListedChatSession[],
	tabs: readonly Tab<PaneViewerData>[],
): ChatSessionTarget[] {
	const claimedSessionIds = new Set<string>();
	const claimedTerminalIds = new Set<string>();
	for (const tab of tabs) {
		for (const pane of Object.values(tab.panes)) {
			const data = pane.data as Partial<ChatPaneData>;
			if (typeof data.terminalId === "string")
				claimedTerminalIds.add(data.terminalId);
			if (pane.kind === "chat-v3" && data.sessionId)
				claimedSessionIds.add(data.sessionId);
		}
	}
	const targets: Array<ChatSessionTarget & { updatedAt: number }> = [];
	for (const session of sessions) {
		if (!session.live || !session.terminalId) continue;
		if (claimedSessionIds.has(session.sessionId)) continue;
		if (claimedTerminalIds.has(session.terminalId)) continue;
		if (isChatSessionClosed(session.sessionId)) continue;
		const presetId = presetForAcpHarness(session.harness);
		if (!presetId) continue;
		targets.push({
			sessionId: session.sessionId,
			presetId,
			terminalId: session.terminalId,
			updatedAt: session.updatedAt,
			...(session.harnessSessionId
				? { harnessSessionId: session.harnessSessionId }
				: {}),
			...(session.title ? { title: session.title } : {}),
		});
	}
	return targets
		.sort((a, b) => a.updatedAt - b.updatedAt)
		.map(({ updatedAt: _updatedAt, ...target }) => target);
}
