import { queryOptions, useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useChannelCoordinatorStore } from "../../stores/channelCoordinatorStore";
import { lastAgentMessage } from "./lastAgentMessage";
import { pickAgentSession } from "./pickAgentSession";

const SESSIONS_POLL_MS = 10_000;
const SESSION_LIMIT = 100;
const MESSAGE_POLL_MS = 15_000;
const MESSAGE_EVENTS = 80;

/**
 * The agent's chat session in its workspace (see `pickAgentSession`). A
 * session that stopped while still starting never carried a conversation, so
 * it never stands for the agent.
 */
export function useAgentSession(workspaceId: string, hostUrl: string | null) {
	return useQuery({
		queryKey: ["channel-agent", "sessions", hostUrl, workspaceId],
		enabled: hostUrl !== null,
		refetchInterval: SESSIONS_POLL_MS,
		queryFn: async () => {
			if (!hostUrl) return null;
			const sessions = await getHostServiceClientByUrl(
				hostUrl,
			).sessions.list.query({ workspaceId, limit: SESSION_LIMIT });
			const coordinators = new Set(
				Object.values(
					useChannelCoordinatorStore.getState().byChannelId,
				).flatMap((coordinator) => coordinator?.sessionId ?? []),
			);
			return pickAgentSession(sessions, coordinators);
		},
	});
}

/** What the agent last said in a chat session, read from the host's journal. */
export function lastMessageQuery(
	hostUrl: string | null,
	workspaceId: string,
	sessionId: string | null,
) {
	return queryOptions({
		queryKey: [
			"channel-agent",
			"last-message",
			hostUrl,
			workspaceId,
			sessionId,
		],
		enabled: hostUrl !== null && sessionId !== null,
		refetchInterval: MESSAGE_POLL_MS,
		queryFn: async () => {
			if (!hostUrl || !sessionId) return null;
			const page = await getHostServiceClientByUrl(hostUrl).sessions.read.query(
				{ workspaceId, sessionId, limit: MESSAGE_EVENTS },
			);
			return page.ok ? lastAgentMessage(page.envelopes) : null;
		},
	});
}

export function useAgentLastMessage(
	hostUrl: string | null,
	workspaceId: string,
	sessionId: string | null,
) {
	return useQuery(lastMessageQuery(hostUrl, workspaceId, sessionId));
}
