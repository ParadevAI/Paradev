import type { Tab } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import { isChatSessionReopened } from "../../../../utils/closedChatSessions";

interface ListedChatSession {
	sessionId: string;
	live: boolean;
	closedByUser?: boolean;
}

/** Chat panes whose chat a person closed somewhere else: on another device, in the CLI or on mobile. */
export function chatPanesClosedElsewhere(
	sessions: readonly ListedChatSession[],
	tabs: readonly Tab<PaneViewerData>[],
): Array<{ tabId: string; paneId: string }> {
	const closedElsewhere = new Set(
		sessions
			.filter((session) => session.closedByUser === true && !session.live)
			.map((session) => session.sessionId),
	);
	if (closedElsewhere.size === 0) return [];
	return tabs.flatMap((tab) =>
		Object.values(tab.panes).flatMap((pane) => {
			if (pane.kind !== "chat-v3") return [];
			const { sessionId } = pane.data as ChatPaneData;
			if (!sessionId || !closedElsewhere.has(sessionId)) return [];
			if (isChatSessionReopened(sessionId)) return [];
			return [{ tabId: tab.id, paneId: pane.id }];
		}),
	);
}
