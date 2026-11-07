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
	{ attempts = 3, retryDelayMs = 500 } = {},
): Promise<T[]> {
	return Promise.all(
		agents.map(async (entry) => {
			if (!entry.ok || !entry.chatSessionId || entry.chatAgentId) return entry;
			const sessionId = entry.chatSessionId;
			for (let attempt = 1; attempt <= attempts; attempt++) {
				try {
					const { session } = await client.sessions.get.query({
						workspaceId,
						sessionId,
					});
					const chatAgentId = presetForAcpHarness(session.harness);
					return chatAgentId ? { ...entry, chatAgentId } : entry;
				} catch (error) {
					if (attempt === attempts) {
						console.warn(
							"[workspace-creates] chat agent lookup failed; no tab for the chat",
							{ workspaceId, sessionId, error },
						);
					} else {
						await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
					}
				}
			}
			return entry;
		}),
	);
}
