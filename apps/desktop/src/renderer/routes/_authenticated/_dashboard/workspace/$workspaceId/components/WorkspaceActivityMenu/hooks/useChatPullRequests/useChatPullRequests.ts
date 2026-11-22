import type { Item } from "@superset/chat/protocol";
import type { WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";
import { useChatWiring } from "../../../../hooks/usePaneRegistry/components/ChatSession/hooks/useSessionClient";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import type { PullRequestEntry } from "../../components/PullRequestRow";
import { collectChatPullRequests } from "./collectChatPullRequests";

export function useChatPullRequests(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	enabled: boolean,
): PullRequestEntry[] {
	const state = useSyncExternalStore(store.subscribe, store.getState);
	const tab = state.tabs.find((tab) => tab.id === state.activeTabId);
	const pane = tab?.activePaneId ? tab.panes[tab.activePaneId] : undefined;
	const sessionId =
		pane?.kind === "chat" ? (pane.data as ChatPaneData).sessionId : null;
	const { transport, streamBaseUrl } = useChatWiring();
	const utils = workspaceTrpc.useUtils();
	const query = useQuery({
		queryKey: ["chat-pull-requests", streamBaseUrl, sessionId],
		enabled: enabled && Boolean(sessionId),
		refetchInterval: enabled ? 30_000 : false,
		queryFn: async () => {
			if (!sessionId) return [];
			const result = await transport.getOutline({ sessionId });
			if (!result.ok) throw new Error("Chat history unavailable");
			const refs = collectChatPullRequests(
				result.outline.items.map(({ item }: { item: Item }) => item),
			);
			const rows = await Promise.allSettled(
				refs.map(async (ref): Promise<PullRequestEntry> => {
					const [repoOwner, repoName] = ref.repoFullName.split("/") as [
						string,
						string,
					];
					const pr = await utils.github.getWorkItem.fetch({
						owner: repoOwner,
						repo: repoName,
						kind: "pr",
						number: ref.number,
					});
					return {
						repoOwner,
						repoName,
						number: pr.number,
						url: pr.url,
						title: pr.title,
						state: pr.state,
						isDraft: pr.draft,
						headBranch: pr.headRefName ?? "",
						checksStatus: "none",
					};
				}),
			);
			return rows.flatMap((row) =>
				row.status === "fulfilled" ? [row.value] : [],
			);
		},
	});
	return sessionId ? (query.data ?? []) : [];
}
