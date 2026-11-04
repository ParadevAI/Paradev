import { presetForAcpHarness } from "@superset/chat/core";
import type { HostServiceClient } from "renderer/lib/host-service-client";

type AgentLaunch =
	| {
			ok: true;
			kind: "terminal";
			sessionId: string;
			label: string;
			chatSessionId?: string;
			chatAgentId?: string;
	  }
	| { ok: false; error: string };

/** Hosts older than `chatAgentId` only return the chat session id, so read its agent from the session. */
export async function resolveChatAgentIds<T extends AgentLaunch>(
	client: Pick<HostServiceClient, "sessions">,
	workspaceId: string,
	agents: T[],
): Promise<T[]> {
	return Promise.all(
		agents.map(async (entry) => {
			if (!entry.ok || !entry.chatSessionId || entry.chatAgentId) return entry;
			const session = await client.sessions.get
				.query({ workspaceId, sessionId: entry.chatSessionId })
				.catch(() => null);
			const chatAgentId = session
				? presetForAcpHarness(session.session.harness)
				: undefined;
			return chatAgentId ? { ...entry, chatAgentId } : entry;
		}),
	);
}
