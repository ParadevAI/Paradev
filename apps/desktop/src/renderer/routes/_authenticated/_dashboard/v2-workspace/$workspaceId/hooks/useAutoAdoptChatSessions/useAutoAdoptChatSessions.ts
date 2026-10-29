import { presetForAcpHarness } from "@superset/chat/core";
import type { WorkspaceStore } from "@superset/panes";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceConnectionRefresh } from "renderer/hooks/host-service/useWorkspaceConnectionRefresh";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import {
	attachCloudChatSession,
	releasePendingCloudChat,
} from "renderer/stores/workspace-creates/pendingCloudChat";
import { type StoreApi, useStore } from "zustand";
import {
	type ChatPaneData,
	type PaneViewerData,
	PENDING_CLOUD_CHAT_PANE_KIND,
	type PendingCloudChatPaneData,
} from "../../types";
import {
	closedCloudChatPromptHashes,
	isChatSessionClosed,
	isChatTerminalClosed,
	markChatSessionClosed,
	reopenCloudChatLaunch,
} from "../../utils/closedChatSessions";
import { markChatSessionLive } from "../usePaneRegistry/components/ChatPane/components/AcpChatPane/hooks/useChatSessionLiveness";
import { hasComposerDraft } from "../usePaneRegistry/components/ChatSession/components/Composer/hooks/useComposerDraft";
import { useChatWiring } from "../usePaneRegistry/components/ChatSession/hooks/useSessionClient";
import { PENDING_CLOUD_CHAT_TIMEOUT_MS } from "./constants";
import { initialCloudChatPromptHash } from "./utils/initialCloudChatPrompt";
import { latestOpenChatSessions } from "./utils/latestOpenChatSessions";
import { unresolvedPollDelay } from "./utils/unresolvedPollDelay";

type PaneStore = StoreApi<WorkspaceStore<PaneViewerData>>;

interface UseAutoAdoptChatSessionsArgs {
	store: PaneStore;
	linkedStores: readonly PaneStore[];
	workspaceId: string;
	isLayoutReady: boolean;
	pendingTimeoutMs?: number;
}

function pendingPanes(stores: readonly PaneStore[]) {
	return stores.flatMap((store) =>
		store.getState().tabs.flatMap((tab) =>
			Object.values(tab.panes)
				.filter((pane) => pane.kind === PENDING_CLOUD_CHAT_PANE_KIND)
				.map((pane) => ({
					store,
					tabId: tab.id,
					paneId: pane.id,
					data: pane.data as PendingCloudChatPaneData,
				})),
		),
	);
}

export function useAutoAdoptChatSessions({
	store,
	linkedStores,
	workspaceId,
	isLayoutReady,
	pendingTimeoutMs = PENDING_CLOUD_CHAT_TIMEOUT_MS,
}: UseAutoAdoptChatSessionsArgs): void {
	const chatAvailability = useAcpChatEnabled();
	const enabled = chatAvailability === "enabled" && isLayoutReady;
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const queryClient = useQueryClient();
	const tabs = useStore(store, (state) => state.tabs);
	const terminalAgents = useTerminalAgentBindings(workspaceId, { enabled });
	const waitingSince = useRef(new Map<string, number>());
	const promptHashCache = useRef(new Map<string, string | null>());
	const queryKey = useMemo(
		() => ["chat-v3", hostUrl, "paneSessions", workspaceId],
		[hostUrl, workspaceId],
	);
	const sessionsQuery = useQuery({
		queryKey,
		queryFn: async () => {
			const sessions = await transport.listSessions({ workspaceId });
			const listed = new Set(
				sessions.map((session) => `${hostUrl}\n${session.sessionId}`),
			);
			for (const key of promptHashCache.current.keys()) {
				if (!listed.has(key)) promptHashCache.current.delete(key);
			}
			const waiting = pendingPanes([store, ...linkedStores]);
			const closedHashes = closedCloudChatPromptHashes(workspaceId);
			const promptHashes: Record<string, string | null> = {};
			const unresolved: string[] = [];
			if (waiting.length || closedHashes.size) {
				for (const session of sessions) {
					const agentId = presetForAcpHarness(session.harness);
					if (
						!session.live ||
						!agentId ||
						(!closedHashes.size &&
							!waiting.some((pane) => pane.data.agentId === agentId))
					)
						continue;
					const key = `${hostUrl}\n${session.sessionId}`;
					let hash = promptHashCache.current.get(key);
					if (hash === undefined) {
						hash = await initialCloudChatPromptHash(
							transport,
							session.sessionId,
						);
						if (hash === undefined) {
							unresolved.push(session.sessionId);
							continue;
						}
						promptHashCache.current.set(key, hash);
					}
					promptHashes[session.sessionId] = hash;
				}
			}
			const previous = queryClient.getQueryData<{
				unresolvedPolls: number;
			}>(queryKey);
			const unresolvedPolls = unresolved.length
				? (previous?.unresolvedPolls ?? 0) + 1
				: 0;
			return { sessions, promptHashes, unresolved, unresolvedPolls };
		},
		enabled,
		structuralSharing: false,
		refetchOnWindowFocus: false,
		refetchInterval: (query) => {
			if (query.state.error && pendingPanes([store, ...linkedStores]).length)
				return 2_000;
			return unresolvedPollDelay(query.state.data?.unresolvedPolls ?? 0);
		},
	});
	const refresh = useWorkspaceConnectionRefresh(workspaceId, queryKey, enabled);
	useWorkspaceEvent("chat:sessions-changed", workspaceId, refresh, enabled);

	// biome-ignore lint/correctness/useExhaustiveDependencies: tabs re-runs it when a waiting pane is restored
	useEffect(() => {
		if (chatAvailability !== "disabled" || !isLayoutReady) return;
		for (const pending of pendingPanes([store, ...linkedStores])) {
			pending.store
				.getState()
				.closePane({ tabId: pending.tabId, paneId: pending.paneId });
		}
	}, [chatAvailability, isLayoutReady, store, linkedStores, tabs]);

	useEffect(() => {
		const result = sessionsQuery.data;
		if (!enabled || !result || sessionsQuery.isFetching) return;
		const stores = [store, ...linkedStores];
		const attached = new Set<string>();
		for (const tab of [
			...tabs,
			...linkedStores.flatMap((paneStore) => paneStore.getState().tabs),
		]) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind !== "terminal" && pane.kind !== "chat-v3") continue;
				const data = pane.data as Partial<ChatPaneData>;
				if (data.terminalId) attached.add(data.terminalId);
				if (data.sessionId) attached.add(data.sessionId);
			}
		}

		const closedHashes = closedCloudChatPromptHashes(workspaceId);
		const now = Date.now();
		let nextDeadline: number | null = null;
		const waitingAgents = new Set<string>();
		for (const pending of pendingPanes(stores)) {
			const forAgent = result.sessions.filter(
				(candidate) =>
					candidate.live &&
					!isChatSessionClosed(candidate.sessionId) &&
					!attached.has(candidate.sessionId) &&
					presetForAcpHarness(candidate.harness) === pending.data.agentId,
			);
			let session = forAgent.find(
				(candidate) =>
					result.promptHashes[candidate.sessionId] === pending.data.promptHash,
			);
			const since = waitingSince.current.get(pending.paneId) ?? now;
			waitingSince.current.set(pending.paneId, since);
			const deadline = since + pendingTimeoutMs;
			const launchedInTerminal =
				!session &&
				[...terminalAgents.values()].some(
					(binding) =>
						binding.agentId === pending.data.agentId &&
						!binding.chatSessionId &&
						binding.endedAt === undefined,
				);
			if (launchedInTerminal) {
				waitingSince.current.delete(pending.paneId);
				const typed =
					pending.data.queuedPrompts?.length ||
					hasComposerDraft(`chat-v3-draft:${pending.data.draftId}`);
				if (typed) {
					pending.store
						.getState()
						.replaceState((state) =>
							releasePendingCloudChat(state, pending.paneId),
						);
				} else {
					pending.store
						.getState()
						.closePane({ tabId: pending.tabId, paneId: pending.paneId });
				}
				continue;
			}
			if (!session && now >= deadline) {
				const launched = forAgent.filter((candidate) => {
					const hash = result.promptHashes[candidate.sessionId];
					return typeof hash === "string" && !closedHashes.has(hash);
				});
				session = launched.length === 1 ? launched[0] : undefined;
				if (!session) {
					waitingSince.current.delete(pending.paneId);
					pending.store
						.getState()
						.replaceState((state) =>
							releasePendingCloudChat(state, pending.paneId),
						);
					continue;
				}
			}
			if (!session) {
				nextDeadline = Math.min(nextDeadline ?? deadline, deadline);
				waitingAgents.add(pending.data.agentId);
				continue;
			}
			waitingSince.current.delete(pending.paneId);
			pending.store
				.getState()
				.replaceState((state) =>
					attachCloudChatSession(state, pending.paneId, session),
				);
			markChatSessionLive(queryClient, hostUrl, session.sessionId);
			attached.add(session.sessionId);
			if (session.terminalId) attached.add(session.terminalId);
			reopenCloudChatLaunch(workspaceId, pending.data.promptHash);
		}
		const deadlineTimer =
			nextDeadline === null
				? undefined
				: setTimeout(refresh, nextDeadline - now);

		for (const session of result.sessions) {
			const hash = result.promptHashes[session.sessionId];
			if (hash && closedHashes.has(hash) && !attached.has(session.sessionId)) {
				markChatSessionClosed(session.sessionId);
				reopenCloudChatLaunch(workspaceId, hash);
			}
		}

		const toAdopt = latestOpenChatSessions(result.sessions, attached)
			.filter(
				(session) =>
					!result.unresolved.includes(session.sessionId) &&
					!isChatSessionClosed(session.sessionId) &&
					!(session.terminalId && isChatTerminalClosed(session.terminalId)) &&
					!(
						(!session.live ||
							typeof result.promptHashes[session.sessionId] === "string") &&
						waitingAgents.has(presetForAcpHarness(session.harness) ?? "")
					) &&
					presetForAcpHarness(session.harness),
			)
			.sort((a, b) => a.updatedAt - b.updatedAt);
		if (toAdopt.length > 0) {
			const state = store.getState();
			const restoreActiveTabId =
				state.tabs.length > 0 ? state.activeTabId : null;
			for (const session of toAdopt) {
				const presetId = presetForAcpHarness(session.harness);
				if (!presetId) continue;
				store.getState().addTab({
					focus: false,
					panes: [
						{
							kind: "chat-v3",
							data: {
								terminalId: session.terminalId ?? session.sessionId,
								sessionId: session.sessionId,
								agent: {
									id: presetId,
									...(session.harnessSessionId
										? { sessionId: session.harnessSessionId }
										: {}),
								},
								...(session.title ? { chatTitle: session.title } : {}),
							} satisfies ChatPaneData,
						},
					],
				});
			}
			if (restoreActiveTabId) store.getState().setActiveTab(restoreActiveTabId);
		}
		return () => clearTimeout(deadlineTimer);
	}, [
		queryClient,
		hostUrl,
		terminalAgents,
		refresh,
		pendingTimeoutMs,
		enabled,
		sessionsQuery.data,
		sessionsQuery.isFetching,
		store,
		linkedStores,
		workspaceId,
		tabs,
	]);
}
