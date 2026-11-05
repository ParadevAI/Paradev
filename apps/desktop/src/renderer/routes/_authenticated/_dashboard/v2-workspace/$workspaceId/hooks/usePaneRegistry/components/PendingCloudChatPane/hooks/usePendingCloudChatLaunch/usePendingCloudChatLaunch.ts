import type { RendererContext } from "@superset/panes";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceConnectionRefresh } from "renderer/hooks/host-service/useWorkspaceConnectionRefresh";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import {
	attachCloudChatSession,
	attachCloudTerminal,
	releasePendingCloudChat,
} from "renderer/stores/workspace-creates/pendingCloudChat";
import type {
	PaneViewerData,
	PendingCloudChatPaneData,
} from "../../../../../../types";
import { markChatSessionLive } from "../../../ChatPane/components/AcpChatPane/hooks/useChatSessionLiveness";
import { hasComposerDraft } from "../../../ChatSession/components/Composer/hooks/useComposerDraft";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";
import {
	PENDING_CLOUD_CHAT_POLL_MS,
	PENDING_CLOUD_CHAT_SESSIONS_LIMIT,
	PENDING_CLOUD_CHAT_TIMEOUT_MS,
} from "./constants";
import { pendingLaunchOutcome } from "./utils/pendingLaunchOutcome";

export function usePendingCloudChatLaunch({
	ctx,
	workspaceId,
	timeoutMs = PENDING_CLOUD_CHAT_TIMEOUT_MS,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	timeoutMs?: number;
}): void {
	const data = ctx.pane.data as PendingCloudChatPaneData;
	const { terminalId } = data;
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const queryClient = useQueryClient();
	const [sinceMs] = useState(Date.now);
	const [nowMs, setNowMs] = useState(sinceMs);
	const queryKey = useMemo(
		() => ["chat-v3", hostUrl, "pendingLaunch", workspaceId],
		[hostUrl, workspaceId],
	);
	const sessionsQuery = useQuery({
		queryKey,
		queryFn: () =>
			transport.listSessions({
				workspaceId,
				limit: PENDING_CLOUD_CHAT_SESSIONS_LIMIT,
			}),
		enabled: !!terminalId,
		refetchInterval: PENDING_CLOUD_CHAT_POLL_MS,
		refetchOnWindowFocus: false,
	});
	const refresh = useWorkspaceConnectionRefresh(
		workspaceId,
		queryKey,
		!!terminalId,
	);
	useWorkspaceEvent(
		"chat:sessions-changed",
		workspaceId,
		refresh,
		!!terminalId,
	);
	const bindings = useTerminalAgentBindings(workspaceId, {
		enabled: !!terminalId,
	});
	const terminalBinding = terminalId ? bindings.get(terminalId) : undefined;

	const outcome = pendingLaunchOutcome({
		terminalId,
		sessions: sessionsQuery.data ?? [],
		launchedTerminal:
			!!terminalBinding &&
			!terminalBinding.chatSessionId &&
			terminalBinding.endedAt === undefined,
		typed:
			!!data.queuedPrompts?.length ||
			hasComposerDraft(`chat-v3-draft:${data.draftId}`),
		sinceMs,
		nowMs,
		timeoutMs,
	});

	const paneId = ctx.pane.id;
	const store = ctx.store;
	const { kind } = outcome;
	const session = outcome.kind === "chat" ? outcome.session : null;
	const untilMs = outcome.kind === "wait" ? outcome.untilMs : null;
	useEffect(() => {
		if (untilMs !== null) {
			const timer = setTimeout(
				() => setNowMs(Date.now()),
				Math.max(0, untilMs - Date.now()),
			);
			return () => clearTimeout(timer);
		}
		store.getState().replaceState((state) => {
			if (session) return attachCloudChatSession(state, paneId, session);
			if (kind === "terminal" && terminalId) {
				return attachCloudTerminal(state, paneId, terminalId);
			}
			return releasePendingCloudChat(state, paneId);
		});
		if (session) markChatSessionLive(queryClient, hostUrl, session.sessionId);
	}, [kind, session, untilMs, store, paneId, terminalId, queryClient, hostUrl]);
}
