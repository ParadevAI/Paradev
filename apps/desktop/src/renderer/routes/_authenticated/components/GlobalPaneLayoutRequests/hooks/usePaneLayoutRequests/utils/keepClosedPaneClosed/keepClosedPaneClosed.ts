import type { PaneLayoutOp } from "@superset/shared/pane-layout-ops";
import { markTerminalForBackground } from "renderer/lib/terminal/terminal-background-intents";
import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
	markChatSessionClosed,
	markChatTerminalClosed,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/closedChatSessions";
import type { PaneAreas } from "../applyPaneLayoutOp";

/**
 * Keeps a pane closed on request from being adopted back into a new tab: a
 * terminal closed with `keepTerminal`, and any chat, whose session is still
 * live for a moment while the caller stops it.
 */
export function keepClosedPaneClosed(
	areas: PaneAreas,
	workspaceId: string,
	op: PaneLayoutOp,
): void {
	if (op.type !== "close") return;
	for (const tab of [...areas.main.tabs, ...areas.sidebar.tabs]) {
		const pane = tab.panes[op.paneId];
		if (!pane) continue;
		if (pane.kind === "terminal" && op.keepTerminal) {
			const { terminalId } = pane.data as { terminalId: string };
			markTerminalForBackground(terminalId, workspaceId);
		}
		if (pane.kind === "chat-v3") {
			const { sessionId, terminalId } = pane.data as Partial<ChatPaneData>;
			if (sessionId) markChatSessionClosed(sessionId);
			if (terminalId) markChatTerminalClosed(terminalId);
		}
		return;
	}
}
