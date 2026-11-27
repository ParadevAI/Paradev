import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useWorkspaceConnectionRefresh } from "renderer/hooks/host-service/useWorkspaceConnectionRefresh";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { logStressEvent } from "renderer/lib/performance/stress-instrumentation";
import { useChatWiring } from "../usePaneRegistry/components/ChatSession/hooks/useSessionClient";
import { CHAT_SESSIONS_LIMIT, CHAT_SESSIONS_POLL_MS } from "./constants";
import {
	createAgentTabSync,
	type PaneStore,
	showStoredChats,
	syncWithHost,
} from "./utils/agentTabSync";
import { storedChatsAsListed } from "./utils/storedChatsAsListed";

interface UseReconcileAgentTabsArgs {
	store: PaneStore;
	linkedStores: readonly PaneStore[];
	workspaceId: string;
	isLayoutReady: boolean;
}

export function useReconcileAgentTabs({
	store,
	linkedStores,
	workspaceId,
	isLayoutReady,
}: UseReconcileAgentTabsArgs): void {
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const workspaceUtils = workspaceTrpc.useUtils();
	const cloudUtils = cloudTrpc.useUtils();
	const [sync] = useState(createAgentTabSync);
	const stores = { main: store, linked: linkedStores };

	const hostKey = useMemo(
		() => ["chat-v3", hostUrl, "agentTabs", workspaceId],
		[hostUrl, workspaceId],
	);
	const host = useQuery({
		queryKey: hostKey,
		queryFn: async ({ signal }) => {
			const { changed, lists } = await syncWithHost(sync, {
				stores,
				workspaceId,
				signal,
				read: async () => {
					const [chats, terminals] = await Promise.allSettled([
						transport.listSessions({ workspaceId, limit: CHAT_SESSIONS_LIMIT }),
						workspaceUtils.terminal.list.fetch({ workspaceId }),
					]);
					return {
						listing: chats,
						chats: chats.status === "fulfilled" ? chats.value : undefined,
						terminals:
							terminals.status === "fulfilled"
								? terminals.value.sessions
								: undefined,
					};
				},
			});
			if (changed) logStressEvent("agent-tabs.reconcile", { workspaceId });
			if (lists.listing.status === "rejected") throw lists.listing.reason;
			return lists.listing.value;
		},
		enabled: isLayoutReady,
		refetchInterval: CHAT_SESSIONS_POLL_MS,
		refetchOnWindowFocus: false,
	});
	const refreshHost = useWorkspaceConnectionRefresh(
		workspaceId,
		hostKey,
		isLayoutReady,
	);
	useWorkspaceEvent(
		"chat:sessions-changed",
		workspaceId,
		refreshHost,
		isLayoutReady,
	);
	useWorkspaceEvent(
		"terminal:lifecycle",
		workspaceId,
		refreshHost,
		isLayoutReady,
	);

	const { workspaces: cloudWorkspaces = [] } = useCloudWorkspaces();
	const isCloud = cloudWorkspaces.some((row) => row.id === workspaceId);
	useQuery({
		queryKey: ["chat-v3", hostUrl, "storedAgentTabs", workspaceId],
		queryFn: async ({ signal }) => {
			await showStoredChats(sync, {
				stores,
				workspaceId,
				signal,
				read: async () =>
					storedChatsAsListed(
						await cloudUtils.chatHistory.ofWorkspace.fetch(
							{ workspaceId },
							{ staleTime: 60_000 },
						),
					),
			});
			return true;
		},
		enabled: isLayoutReady && isCloud && !host.data,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});
}
