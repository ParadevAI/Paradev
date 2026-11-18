import type { Tab } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../../../types";

interface HostChatSession {
	sessionId: string;
	closedAt?: number | null;
}

/**
 * Panes opened from the database before the box answered whose chat the box
 * has since closed, for any reason, or never had: the database does not know
 * which chats were closed.
 */
export function storedPanesTheHostClosed({
	sessions,
	tabs,
	storedSessionIds,
}: {
	sessions: readonly HostChatSession[];
	tabs: readonly Tab<PaneViewerData>[];
	storedSessionIds: ReadonlySet<string>;
}): Array<{ tabId: string; paneId: string }> {
	if (storedSessionIds.size === 0) return [];
	const open = new Set(
		sessions
			.filter((session) => !session.closedAt)
			.map((session) => session.sessionId),
	);
	return tabs.flatMap((tab) =>
		Object.values(tab.panes).flatMap((pane) => {
			if (pane.kind !== "chat-v3") return [];
			const { sessionId } = pane.data as ChatPaneData;
			if (!sessionId || !storedSessionIds.has(sessionId)) return [];
			return open.has(sessionId) ? [] : [{ tabId: tab.id, paneId: pane.id }];
		}),
	);
}
