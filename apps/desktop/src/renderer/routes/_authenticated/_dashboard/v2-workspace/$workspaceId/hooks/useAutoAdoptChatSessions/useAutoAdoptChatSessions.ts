import type { WorkspaceStore } from "@superset/panes";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useWorkspaceConnectionRefresh } from "renderer/hooks/host-service/useWorkspaceConnectionRefresh";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { focusChatSession } from "../../utils/focusChatSession";
import { useChatWiring } from "../usePaneRegistry/components/ChatSession/hooks/useSessionClient";
import { CHAT_ADOPT_POLL_MS, CHAT_ADOPT_SESSIONS_LIMIT } from "./constants";
import { chatSessionsToAdopt } from "./utils/chatSessionsToAdopt";

interface UseAutoAdoptChatSessionsArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
	workspaceId: string;
	isLayoutReady: boolean;
}

export function useAutoAdoptChatSessions({
	store,
	linkedStores,
	workspaceId,
	isLayoutReady,
}: UseAutoAdoptChatSessionsArgs): void {
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

	useEffect(() => {
		if (!isLayoutReady || !sessions || isFetchingSessions) return;
		const state = store.getState();
		const toAdopt = chatSessionsToAdopt(sessions, [
			...state.tabs,
			...linkedStores.flatMap((linked) => linked.getState().tabs),
		]);
		if (toAdopt.length === 0) return;
		const restoreActiveTabId = state.tabs.length > 0 ? state.activeTabId : null;
		for (const session of toAdopt) {
			focusChatSession({ store, linkedStores, session, focus: false });
		}
		if (restoreActiveTabId) store.getState().setActiveTab(restoreActiveTabId);
	}, [isLayoutReady, isFetchingSessions, sessions, store, linkedStores]);
}
