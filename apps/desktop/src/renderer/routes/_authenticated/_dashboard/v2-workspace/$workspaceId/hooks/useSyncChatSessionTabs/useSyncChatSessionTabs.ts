import { createWorkspaceStore, type WorkspaceStore } from "@superset/panes";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useWorkspaceConnectionRefresh } from "renderer/hooks/host-service/useWorkspaceConnectionRefresh";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { addChatTab } from "../../utils/focusChatSession";
import { useChatWiring } from "../usePaneRegistry/components/ChatSession/hooks/useSessionClient";
import { CHAT_ADOPT_POLL_MS, CHAT_ADOPT_SESSIONS_LIMIT } from "./constants";
import { chatPanesClosedElsewhere } from "./utils/chatPanesClosedElsewhere";
import { chatSessionsToAdopt } from "./utils/chatSessionsToAdopt";

interface UseSyncChatSessionTabsArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
	workspaceId: string;
	isLayoutReady: boolean;
}

export function useSyncChatSessionTabs({
	store,
	linkedStores,
	workspaceId,
	isLayoutReady,
}: UseSyncChatSessionTabsArgs): void {
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const queryKey = useMemo(
		() => ["chat-v3", hostUrl, "autoAdopt", workspaceId],
		[hostUrl, workspaceId],
	);
	const sessionsQuery = useQuery({
		queryKey,
		queryFn: () =>
			transport.listSessions({
				workspaceId,
				limit: CHAT_ADOPT_SESSIONS_LIMIT,
			}),
		enabled: isLayoutReady,
		refetchInterval: CHAT_ADOPT_POLL_MS,
		refetchOnWindowFocus: false,
	});
	const refresh = useWorkspaceConnectionRefresh(
		workspaceId,
		queryKey,
		isLayoutReady,
	);
	useWorkspaceEvent(
		"chat:sessions-changed",
		workspaceId,
		refresh,
		isLayoutReady,
	);
	const sessions = sessionsQuery.data;
	const isFetchingSessions = sessionsQuery.isFetching;
	const openedEmpty = useRef<boolean | null>(null);
	useEffect(() => {
		if (!isLayoutReady || openedEmpty.current !== null) return;
		openedEmpty.current = [store, ...linkedStores].every(
			(paneStore) => paneStore.getState().tabs.length === 0,
		);
	}, [isLayoutReady, store, linkedStores]);

	useEffect(() => {
		if (!isLayoutReady || !sessions || isFetchingSessions) return;
		for (const paneStore of [store, ...linkedStores]) {
			const panes = chatPanesClosedElsewhere(
				sessions,
				paneStore.getState().tabs,
			);
			for (const { tabId, paneId } of panes) {
				paneStore.getState().closePane({ tabId, paneId, intent: "remove" });
			}
		}
		const { version, tabs, activeTabId } = store.getState();
		const toAdopt = chatSessionsToAdopt({
			sessions,
			tabs: [
				...tabs,
				...linkedStores.flatMap((linked) => linked.getState().tabs),
			],
			workspaceId,
		});
		// A workspace opened with no tabs of the user's lands on the newest chat,
		// not on a setup terminal that was opened for it a moment earlier.
		const selectChat =
			openedEmpty.current === true &&
			tabs.every((tab) =>
				Object.values(tab.panes).every((pane) => pane.kind === "terminal"),
			);
		openedEmpty.current = false;
		if (toAdopt.length === 0) return;
		// One write with the user's tab still selected: `addTab` selects each new
		// tab, and a selection change alone is not saved.
		const next = createWorkspaceStore<PaneViewerData>({
			initialState: { version, tabs, activeTabId },
		});
		for (const session of toAdopt) {
			addChatTab({ store: next, session, focus: false });
		}
		if (activeTabId && !selectChat) next.getState().setActiveTab(activeTabId);
		store.getState().replaceState({
			version,
			tabs: next.getState().tabs,
			activeTabId: next.getState().activeTabId,
		});
	}, [
		isLayoutReady,
		isFetchingSessions,
		sessions,
		store,
		linkedStores,
		workspaceId,
	]);
}
