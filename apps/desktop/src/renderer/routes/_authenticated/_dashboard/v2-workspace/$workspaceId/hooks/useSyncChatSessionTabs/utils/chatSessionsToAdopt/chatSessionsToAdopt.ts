import { presetForAcpHarness } from "@superset/chat/core";
import type { Tab } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import {
	isChatSessionClosed,
	isChatTerminalIgnored,
} from "../../../../utils/closedChatSessions";
import type { ChatSessionTarget } from "../../../../utils/focusChatSession";
import {
	readPendingChatStops,
	readPendingChatStopTerminalIds,
} from "../../../../utils/pendingChatStops";
import { CHAT_ADOPT_MAX_LIVE_CHATS } from "../../constants";

interface ListedChatSession {
	sessionId: string;
	harness: string;
	harnessSessionId: string | null;
	title: string | null;
	updatedAt: number;
	live: boolean;
	terminalId: string | null;
	/** Every close sets it; a chat that only lost its process (host restart, cloud sleep) has none. */
	closedAt?: number | null;
}

/**
 * Live chats in the workspace that no pane shows, oldest first. A pane
 * claims a chat by its session id or by its terminal id, so a chat the
 * desktop is still creating (or a pending cloud launch) is never adopted twice.
 * A chat with no terminal uses its session id, as the host's `panes.newTab` does.
 * Only the most recently active live chats are candidates, so a workspace with
 * many idle chats does not open a tab for each of them. A workspace that opened
 * with no tabs and has no live chat gets its newest stopped chat nobody closed.
 */
export function chatSessionsToAdopt({
	sessions,
	tabs,
	workspaceId,
	openedEmpty = false,
}: {
	sessions: readonly ListedChatSession[];
	tabs: readonly Tab<PaneViewerData>[];
	workspaceId: string;
	openedEmpty?: boolean;
}): ChatSessionTarget[] {
	const claimedSessionIds = new Set<string>(readPendingChatStops(workspaceId));
	const claimedTerminalIds = new Set<string>(
		readPendingChatStopTerminalIds(workspaceId),
	);
	for (const tab of tabs) {
		for (const pane of Object.values(tab.panes)) {
			const data = pane.data as Partial<ChatPaneData>;
			if (typeof data.terminalId === "string")
				claimedTerminalIds.add(data.terminalId);
			if (pane.kind === "chat-v3" && data.sessionId)
				claimedSessionIds.add(data.sessionId);
		}
	}
	const adoptable = sessions
		.filter(
			(session) =>
				presetForAcpHarness(session.harness) &&
				!isChatSessionClosed(session.sessionId) &&
				!isChatTerminalIgnored(session.terminalId ?? session.sessionId),
		)
		.sort((a, b) => b.updatedAt - a.updatedAt);
	const live = adoptable
		.filter((session) => session.live)
		.slice(0, CHAT_ADOPT_MAX_LIVE_CHATS);
	const candidates =
		live.length === 0 && openedEmpty
			? adoptable.filter((session) => !session.closedAt).slice(0, 1)
			: live;
	const targets: Array<ChatSessionTarget & { updatedAt: number }> = [];
	for (const session of candidates) {
		const terminalId = session.terminalId ?? session.sessionId;
		if (claimedSessionIds.has(session.sessionId)) continue;
		if (claimedTerminalIds.has(terminalId)) continue;
		const presetId = presetForAcpHarness(session.harness);
		if (!presetId) continue;
		targets.push({
			sessionId: session.sessionId,
			presetId,
			terminalId,
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
