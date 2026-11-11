import { acpHarnessForPreset } from "@superset/chat/core";
import type { DiscoverSessionsResult } from "@superset/chat/protocol";
import type { WorkspaceStore } from "@superset/panes";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { focusAgentSession } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/focusAgentSession";
import { focusChatSession } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/focusChatSession";
import type { StoreApi } from "zustand/vanilla";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";
import { type HistoryEntry, historyEntries } from "./utils/historyEntries";

export function useChatHistory({
	workspaceId,
	current,
	store,
	linkedStores = [],
	enabled,
	recentOnly = false,
}: {
	workspaceId: string;
	current: ChatPaneData;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores?: StoreApi<WorkspaceStore<PaneViewerData>>[];
	enabled: boolean;
	recentOnly?: boolean;
}) {
	const staleTime = recentOnly ? 30_000 : 0;
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const harness = acpHarnessForPreset(current.agent?.id);
	const saved = useQuery({
		queryKey: ["chat-v3", hostUrl, "history", workspaceId],
		queryFn: () => transport.listSessions({ workspaceId, limit: 200 }),
		enabled,
		staleTime,
		refetchOnWindowFocus: false,
	});
	const native = useInfiniteQuery({
		queryKey: ["chat-v3", hostUrl, "discoverSessions", workspaceId, harness],
		queryFn: ({ pageParam }) =>
			transport
				.discoverSessions({
					workspaceId,
					harness: harness ?? "",
					...(pageParam ? { cursor: pageParam } : {}),
				})
				.catch((error: unknown): DiscoverSessionsResult => {
					if (!isMissingProcedureError(error)) throw error;
					return { supported: false, sessions: [] };
				}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor,
		enabled: enabled && !!harness,
		staleTime,
		retry: false,
		refetchOnWindowFocus: false,
	});
	const agentSessions = cloudTrpc.agent.listSessions.useQuery(
		{ cloudWorkspaceId: workspaceId },
		{
			enabled: enabled && !recentOnly,
			refetchOnWindowFocus: false,
			retry: false,
		},
	);
	const entries = historyEntries(
		saved.data ?? [],
		native.data?.pages.flatMap((page) => page.sessions) ?? [],
		harness ?? "",
	);
	const isCurrent = (entry: HistoryEntry) =>
		(entry.sessionId !== null && entry.sessionId === current.sessionId) ||
		(entry.presetId === current.agent?.id &&
			entry.harnessSessionId !== undefined &&
			entry.harnessSessionId === current.agent?.sessionId);
	const openEntry = (entry: HistoryEntry) =>
		focusChatSession({ store, linkedStores, session: entry });
	const openAgentSession = (session: {
		sessionId: string;
		agentName: string;
	}) =>
		focusAgentSession({
			store,
			linkedStores,
			session: { id: session.sessionId, agentName: session.agentName },
		});

	return {
		saved,
		native,
		entries,
		agentSessions: agentSessions.data ?? [],
		isCurrent,
		openEntry,
		openAgentSession,
	};
}
