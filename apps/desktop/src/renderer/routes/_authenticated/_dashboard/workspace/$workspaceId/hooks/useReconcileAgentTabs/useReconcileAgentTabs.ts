import { presetForAcpHarness } from "@superset/chat/core";
import type { WorkspaceState, WorkspaceStore } from "@superset/panes";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useWorkspaceConnectionRefresh } from "renderer/hooks/host-service/useWorkspaceConnectionRefresh";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useWorkspaceTerminalSessions } from "renderer/hooks/host-service/useWorkspaceTerminalSessions";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { logStressEvent } from "renderer/lib/performance/stress-instrumentation";
import { getTerminalBackgroundMarkerIdsKey } from "renderer/lib/terminal/terminal-background-intents";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { parseAttachedTerminalIdsKey } from "../../utils/backgroundTerminals";
import { isTerminalReplacementCancelled } from "../../utils/cancelledTerminalReplacements";
import {
	isChatSessionClosed,
	isChatSessionReopened,
	isChatTerminalIgnored,
} from "../../utils/closedChatSessions";
import {
	readPendingChatStops,
	readPendingChatStopTerminalIds,
} from "../../utils/pendingChatStops";
import { useChatWiring } from "../usePaneRegistry/components/ChatSession/hooks/useSessionClient";
import { CHAT_SESSIONS_LIMIT, CHAT_SESSIONS_POLL_MS } from "./constants";
import type { ListedChatSession } from "./utils/chatConversations";
import {
	type AgentTabHiding,
	type ReconcileAgentTabsInput,
	reconcileAgentTabs,
} from "./utils/reconcileAgentTabs";
import { storedChatsAsListed } from "./utils/storedChatsAsListed";

type PaneStore = StoreApi<WorkspaceStore<PaneViewerData>>;

interface UseReconcileAgentTabsArgs {
	store: PaneStore;
	linkedStores: readonly PaneStore[];
	workspaceId: string;
	isLayoutReady: boolean;
}

/**
 * Keeps the workspace's agent tabs in step with the host's chats and
 * terminals. The only automatic writer of agent tabs once a workspace is
 * open: see reconcileAgentTabs for the rules.
 */
export function useReconcileAgentTabs({
	store,
	linkedStores,
	workspaceId,
	isLayoutReady,
}: UseReconcileAgentTabsArgs): void {
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const chatsKey = useMemo(
		() => ["chat-v3", hostUrl, "autoAdopt", workspaceId],
		[hostUrl, workspaceId],
	);
	const chatsQuery = useQuery({
		queryKey: chatsKey,
		queryFn: () =>
			transport.listSessions({ workspaceId, limit: CHAT_SESSIONS_LIMIT }),
		enabled: isLayoutReady,
		refetchInterval: CHAT_SESSIONS_POLL_MS,
		refetchOnWindowFocus: false,
	});
	const refreshChats = useWorkspaceConnectionRefresh(
		workspaceId,
		chatsKey,
		isLayoutReady,
	);
	useWorkspaceEvent(
		"chat:sessions-changed",
		workspaceId,
		refreshChats,
		isLayoutReady,
	);
	const terminalsQuery = useWorkspaceTerminalSessions(workspaceId, {
		enabled: isLayoutReady,
	});
	// A list still refetching may name a session closed or killed meanwhile.
	const chats =
		chatsQuery.data && !chatsQuery.isFetching ? chatsQuery.data : undefined;
	const terminals =
		terminalsQuery.data && !terminalsQuery.isFetching
			? terminalsQuery.data.sessions
			: undefined;

	const { workspaces: cloudWorkspaces = [] } = useCloudWorkspaces();
	const isCloud = cloudWorkspaces.some((row) => row.id === workspaceId);
	const storedChats = cloudTrpc.chatHistory.ofWorkspace.useQuery(
		{ workspaceId },
		{
			enabled: isLayoutReady && isCloud && !chatsQuery.data,
			staleTime: 60_000,
		},
	).data;

	const openedEmpty = useRef<boolean | null>(null);
	const storedSessionIds = useRef(new Set<string>());
	const showedStored = useRef(false);

	useEffect(() => {
		if (!isLayoutReady || openedEmpty.current !== null) return;
		openedEmpty.current = [store, ...linkedStores].every(
			(paneStore) => paneStore.getState().tabs.length === 0,
		);
	}, [isLayoutReady, store, linkedStores]);

	// A cloud workspace opened here for the first time shows its stored chats
	// while the box wakes; the box's own list then closes any it had closed.
	useEffect(() => {
		if (!isLayoutReady || chatsQuery.data || !storedChats) return;
		if (showedStored.current) return;
		showedStored.current = true;
		if (openedEmpty.current !== true) return;
		const listed = storedChatsAsListed(storedChats);
		apply(
			store,
			linkedStores,
			reconcileAgentTabs({
				...baseInput(store, linkedStores, workspaceId, true),
				chats: listed,
			}),
		);
		for (const chat of listed) storedSessionIds.current.add(chat.sessionId);
	}, [
		isLayoutReady,
		chatsQuery.data,
		storedChats,
		store,
		linkedStores,
		workspaceId,
	]);

	useEffect(() => {
		if (!isLayoutReady || (!chats && !terminals)) return;
		const input: ReconcileAgentTabsInput = {
			...baseInput(
				store,
				linkedStores,
				workspaceId,
				openedEmpty.current === true,
			),
			chats: chats as readonly ListedChatSession[] | undefined,
			terminals,
			...(chats && storedSessionIds.current.size > 0
				? { storedSessionIds: new Set(storedSessionIds.current) }
				: {}),
		};
		const result = reconcileAgentTabs(input);
		if (chats) {
			storedSessionIds.current.clear();
			if (chats.length > 0) openedEmpty.current = false;
		}
		if (!result.changed) return;
		apply(store, linkedStores, result);
		logStressEvent("agent-tabs.reconcile", { workspaceId });
	}, [isLayoutReady, chats, terminals, store, linkedStores, workspaceId]);
}

function baseInput(
	store: PaneStore,
	linkedStores: readonly PaneStore[],
	workspaceId: string,
	openedEmpty: boolean,
): ReconcileAgentTabsInput {
	return {
		main: layoutOf(store),
		linked: linkedStores.map(layoutOf),
		presetFor: presetForAcpHarness,
		hiding: hidingIn(workspaceId),
		openedEmpty,
	};
}

function hidingIn(workspaceId: string): AgentTabHiding {
	const stoppingSessions = new Set(readPendingChatStops(workspaceId));
	const stoppingTerminals = new Set(
		readPendingChatStopTerminalIds(workspaceId),
	);
	const backgrounded = new Set(
		parseAttachedTerminalIdsKey(getTerminalBackgroundMarkerIdsKey(workspaceId)),
	);
	return {
		chatSession: (sessionId) =>
			isChatSessionClosed(sessionId) || stoppingSessions.has(sessionId),
		chatTerminal: (terminalId) =>
			isChatTerminalIgnored(terminalId) || stoppingTerminals.has(terminalId),
		terminal: (terminalId) =>
			backgrounded.has(terminalId) ||
			isTerminalReplacementCancelled(terminalId),
		reopened: isChatSessionReopened,
	};
}

function layoutOf(store: PaneStore): WorkspaceState<PaneViewerData> {
	const { version, tabs, activeTabId } = store.getState();
	return { version, tabs, activeTabId };
}

function apply(
	store: PaneStore,
	linkedStores: readonly PaneStore[],
	result: ReturnType<typeof reconcileAgentTabs>,
): void {
	if (!result.changed) return;
	if (store.getState().tabs !== result.main.tabs) {
		store.getState().replaceState(result.main);
	}
	linkedStores.forEach((linked, index) => {
		const next = result.linked[index];
		if (next && linked.getState().tabs !== next.tabs) {
			linked.getState().replaceState(next);
		}
	});
}
