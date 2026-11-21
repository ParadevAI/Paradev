import type { TurnChanges } from "@superset/chat-runtime";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";

const LIVE_REFRESH_MS = 3_000;

/**
 * What a turn changed, from its worktree snapshots: undefined while loading,
 * null when the turn has none or the host predates them. A live read
 * snapshots the worktree again whenever `refreshKey` changes, at most every
 * few seconds; a settled one reads again after a commit or checkout, so
 * files committed since drop off.
 */
export function useTurnChanges(
	turnId: string | null,
	{
		anchorItemIds,
		live = false,
		refreshKey = 0,
	}: {
		/** The turn's tool call ids, to find a settled turn after the chat resumed. */
		anchorItemIds?: string[];
		live?: boolean;
		refreshKey?: number;
	} = {},
): { changes: TurnChanges | null | undefined; reload: () => void } {
	const { turnChanges, workspaceId } = useChatPaneActions();
	const lastLoadAt = useRef(0);
	const query = useQuery({
		queryKey: [
			"chat-turn-changes",
			turnChanges?.sessionId,
			turnId,
			live,
			anchorItemIds?.join(","),
		],
		queryFn: async () => {
			lastLoadAt.current = Date.now();
			if (!turnChanges || !turnId) return null;
			const changes = await turnChanges.load(turnId, live, anchorItemIds);
			return changes === "unsupported" ? null : changes;
		},
		enabled: Boolean(turnChanges && turnId),
		staleTime: live ? 0 : Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		retry: false,
	});
	const { refetch } = query;

	useWorkspaceEvent(
		"git:changed",
		workspaceId ?? "",
		({ paths }) => {
			if (!paths) void refetch();
		},
		Boolean(workspaceId && !live && query.data),
	);

	useEffect(() => {
		if (!live || refreshKey === 0) return;
		const wait = Math.max(0, lastLoadAt.current + LIVE_REFRESH_MS - Date.now());
		const timer = setTimeout(() => void refetch(), wait);
		return () => clearTimeout(timer);
	}, [live, refreshKey, refetch]);

	return {
		changes: query.isError ? null : query.data,
		reload: () => void refetch(),
	};
}
