import type { HostServiceClient } from "renderer/lib/host-service-client";
import { resolveChatAgentIds } from "../resolveChatAgentIds";

/**
 * The agents a create launched, read back from the host's bindings when the
 * create result itself was lost. Empty when the host cannot be asked.
 */
export async function recoverAgentLaunches(
	client: Pick<HostServiceClient, "terminalAgents" | "sessions">,
	workspaceId: string,
) {
	const bindings = await client.terminalAgents.listByWorkspace
		.query({ workspaceId })
		.catch((error) => {
			console.warn("[workspace-creates] could not read agent bindings", {
				workspaceId,
				error,
			});
			return [];
		});
	const launches = bindings
		.filter((binding) => binding.endedAt === undefined)
		.map((binding) => ({
			ok: true as const,
			kind: "terminal" as const,
			sessionId: binding.terminalId,
			label: "",
			...(binding.chatSessionId
				? { chatSessionId: binding.chatSessionId }
				: {}),
		}));
	return resolveChatAgentIds(client, workspaceId, launches);
}
