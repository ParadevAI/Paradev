import type { WorkspaceStore } from "@superset/panes";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import type { StoreApi } from "zustand/vanilla";
import type { ConsumeSearch, PaneViewerData } from "../../types";
import { focusChatSession } from "../../utils/focusChatSession";
import {
	focusOrAddTerminalPane,
	focusTerminalPane,
} from "../../utils/focusTerminalPane";
import { useChatWiring } from "../usePaneRegistry/components/ChatSession/hooks/useSessionClient";
import { chatSessionTarget } from "./chatSessionTarget";

interface UseConsumeAutomationRunLinkArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores?: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
	isLayoutReady: boolean;
	workspaceId: string;
	sessionId: string | undefined;
	terminalId: string | undefined;
	focusRequestId: string | undefined;
	consumeSearch: ConsumeSearch;
}

export function useConsumeAutomationRunLink({
	store,
	linkedStores,
	isLayoutReady,
	workspaceId,
	sessionId,
	terminalId,
	focusRequestId,
	consumeSearch,
}: UseConsumeAutomationRunLinkArgs): void {
	const consumedRef = useRef<Set<string>>(new Set());
	const acpChat = useAcpChatEnabled();
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const chatQuery = useQuery({
		queryKey: [
			"chat-v3",
			hostUrl,
			"runLink",
			workspaceId,
			sessionId,
			focusRequestId,
		],
		queryFn: async () => {
			if (!sessionId) return null;
			const result = await transport.getSession({ sessionId });
			if (result.session?.scopeId !== workspaceId) return null;
			const sessions = result.live
				? await transport.listSessions({ workspaceId })
				: [];
			return chatSessionTarget({ result, sessions, sessionId, workspaceId });
		},
		enabled: !!sessionId && acpChat === "enabled" && isLayoutReady,
		refetchOnWindowFocus: false,
		retry: false,
	});
	useEffect(() => {
		if (!sessionId || !isLayoutReady || acpChat === "resolving") return;
		if (
			acpChat === "enabled" &&
			(chatQuery.isFetching || (!chatQuery.isSuccess && !chatQuery.isError))
		)
			return;
		const key = `${workspaceId}:${getAutomationRunLinkConsumeKey({
			type: "chat",
			id: sessionId,
			focusRequestId,
		})}`;
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		const target =
			acpChat === "enabled" && chatQuery.isSuccess ? chatQuery.data : null;
		consumeSearch(target ? ["sessionId", "terminalId"] : ["sessionId"]);
		if (target) focusChatSession({ store, linkedStores, session: target });
	}, [
		sessionId,
		isLayoutReady,
		acpChat,
		chatQuery.isSuccess,
		chatQuery.isError,
		chatQuery.isFetching,
		chatQuery.data,
		workspaceId,
		focusRequestId,
		consumeSearch,
		store,
		linkedStores,
	]);
	const terminalSessionsQuery = workspaceTrpc.terminal.list.useQuery(
		{ workspaceId },
		{
			enabled: terminalId != null && !sessionId,
			refetchOnWindowFocus: false,
		},
	);
	const linkedTerminalIsLive =
		terminalId != null &&
		terminalSessionsQuery.isSuccess &&
		terminalSessionBelongsToWorkspace({
			sessions: terminalSessionsQuery.data.sessions,
			terminalId,
			workspaceId,
		});
	// Only a dead link is worth a successor lookup — the live case is the
	// common one and needs nothing more than the session list.
	const successorQuery = workspaceTrpc.terminalAgents.resumedSuccessor.useQuery(
		{ workspaceId, terminalId: terminalId ?? "" },
		{
			enabled:
				terminalId != null &&
				!sessionId &&
				terminalSessionsQuery.isSuccess &&
				!linkedTerminalIsLive,
			refetchOnWindowFocus: false,
		},
	);
	// undefined = still resolving; null = nothing to open.
	const targetTerminalId = linkedTerminalIsLive
		? terminalId
		: successorQuery.isSuccess
			? (successorQuery.data?.terminalId ?? null)
			: undefined;
	useEffect(() => {
		if (
			sessionId ||
			!isLayoutReady ||
			!terminalId ||
			targetTerminalId === undefined
		)
			return;
		const key = getAutomationRunLinkConsumeKey({
			type: "terminal",
			id: terminalId,
			focusRequestId,
		});
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		consumeSearch(["terminalId"]);
		if (targetTerminalId === null) {
			if (focusTerminalPane(store, terminalId)) return;
			console.warn(
				"[automation-run-link] Ignoring terminal link: not in this workspace and not resumed elsewhere",
				{ terminalId, workspaceId },
			);
			return;
		}
		focusOrAddTerminalPane(store, targetTerminalId);
	}, [
		store,
		sessionId,
		isLayoutReady,
		terminalId,
		focusRequestId,
		targetTerminalId,
		workspaceId,
		consumeSearch,
	]);
}

export function getAutomationRunLinkConsumeKey({
	type,
	id,
	focusRequestId,
}: {
	type: "terminal" | "chat";
	id: string;
	focusRequestId: string | undefined;
}): string {
	return focusRequestId
		? `${type}:${id}:focus:${focusRequestId}`
		: `${type}:${id}`;
}

export function terminalSessionBelongsToWorkspace({
	sessions,
	terminalId,
	workspaceId,
}: {
	sessions: Array<{ terminalId: string; workspaceId: string }>;
	terminalId: string;
	workspaceId: string;
}): boolean {
	return sessions.some(
		(session) =>
			session.terminalId === terminalId && session.workspaceId === workspaceId,
	);
}
