import type { RendererContext } from "@superset/panes";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceConnectionRefresh } from "renderer/hooks/host-service/useWorkspaceConnectionRefresh";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useWorkspaceTerminalSessions } from "renderer/hooks/host-service/useWorkspaceTerminalSessions";
import { provisioningSince } from "renderer/routes/_authenticated/_dashboard/utils/provisioningSince";
import {
	attachCloudChatSession,
	attachCloudTerminal,
	pendingLaunchSurface,
	releasePendingCloudChat,
} from "renderer/stores/workspace-creates/pendingCloudLaunch";
import type {
	PaneViewerData,
	PendingCloudLaunchPaneData,
} from "../../../../../../types";
import { chatDraftKey } from "../../../../utils/chatDraftKey";
import { markChatSessionLive } from "../../../ChatPane/components/AcpChatPane/hooks/useChatSessionLiveness";
import { hasComposerDraft } from "../../../ChatSession/components/Composer/hooks/useComposerDraft";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";
import {
	PENDING_CLOUD_LAUNCH_NO_ANSWER_TIMEOUT_MS,
	PENDING_CLOUD_LAUNCH_POLL_MS,
	PENDING_CLOUD_LAUNCH_SESSIONS_LIMIT,
	PENDING_CLOUD_LAUNCH_TIMEOUT_MS,
} from "./constants";
import { pendingLaunchOutcome } from "./utils/pendingLaunchOutcome";

export function usePendingCloudLaunch({
	ctx,
	workspaceId,
	timeoutMs = PENDING_CLOUD_LAUNCH_TIMEOUT_MS,
	noAnswerTimeoutMs = PENDING_CLOUD_LAUNCH_NO_ANSWER_TIMEOUT_MS,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	timeoutMs?: number;
	noAnswerTimeoutMs?: number;
}): void {
	const data = ctx.pane.data as PendingCloudLaunchPaneData;
	const { terminalId } = data;
	const surface = pendingLaunchSurface(data);
	const watchesChats = !!terminalId && surface === "chat";
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const queryClient = useQueryClient();
	const [sinceMs] = useState(() => provisioningSince(workspaceId));
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
				limit: PENDING_CLOUD_LAUNCH_SESSIONS_LIMIT,
			}),
		enabled: watchesChats,
		refetchInterval: PENDING_CLOUD_LAUNCH_POLL_MS,
		refetchOnWindowFocus: false,
	});
	const refresh = useWorkspaceConnectionRefresh(
		workspaceId,
		queryKey,
		watchesChats,
	);
	useWorkspaceEvent(
		"chat:sessions-changed",
		workspaceId,
		refresh,
		watchesChats,
	);
	const bindings = useTerminalAgentBindings(workspaceId, {
		enabled: !!terminalId,
	});
	const terminalBinding = terminalId ? bindings.get(terminalId) : undefined;
	const terminalSessions = useWorkspaceTerminalSessions(workspaceId, {
		enabled: !!terminalId && surface === "terminal",
	});
	const terminalListed = !!terminalSessions.data?.sessions.some(
		(session) => session.terminalId === terminalId,
	);
	const answer = surface === "chat" ? sessionsQuery : terminalSessions;
	const [answeredAtMs, setAnsweredAtMs] = useState<number | null>(null);
	if (answer.data !== undefined && answeredAtMs === null) {
		setAnsweredAtMs(answer.dataUpdatedAt);
		setNowMs(Math.max(nowMs, answer.dataUpdatedAt));
	}

	const outcome = pendingLaunchOutcome({
		surface,
		terminalId,
		sessions: sessionsQuery.data ?? [],
		terminalListed,
		terminalBinding,
		typed:
			!!data.queuedPrompts?.length ||
			hasComposerDraft(chatDraftKey(data.draftId)),
		sinceMs,
		answeredAtMs,
		nowMs,
		timeoutMs,
		noAnswerTimeoutMs,
	});

	const paneId = ctx.pane.id;
	const tabId = ctx.tab.id;
	const store = ctx.store;
	const { kind } = outcome;
	const session = outcome.kind === "chat" ? outcome.session : null;
	const untilMs = outcome.kind === "wait" ? outcome.untilMs : null;
	useEffect(() => {
		switch (kind) {
			case "wait": {
				if (untilMs === null) return;
				const timer = setTimeout(
					() => setNowMs(Date.now()),
					Math.max(0, untilMs - Date.now()),
				);
				return () => clearTimeout(timer);
			}
			case "chat":
				if (!session) return;
				store.getState().replaceState((state) =>
					attachCloudChatSession(state, paneId, {
						...session,
						terminalId: session.terminalId ?? terminalId ?? null,
					}),
				);
				if (session.live)
					markChatSessionLive(queryClient, hostUrl, session.sessionId);
				return;
			case "terminal":
				if (!terminalId) return;
				store
					.getState()
					.replaceState((state) =>
						attachCloudTerminal(state, paneId, terminalId),
					);
				return;
			case "release":
				store
					.getState()
					.replaceState((state) => releasePendingCloudChat(state, paneId));
				return;
			case "drop":
				store.getState().closePane({ tabId, paneId, intent: "remove" });
				return;
			default:
				return kind satisfies never;
		}
	}, [
		kind,
		session,
		untilMs,
		store,
		paneId,
		tabId,
		terminalId,
		queryClient,
		hostUrl,
	]);
}
