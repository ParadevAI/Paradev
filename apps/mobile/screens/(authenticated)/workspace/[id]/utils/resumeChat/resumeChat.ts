import type { ChatTransport } from "@superset/chat/client";

export interface ResumeChatInput {
	commandId: string;
	workspaceId: string;
	sessionId: string;
	harness: string;
	harnessSessionId: string;
}

/**
 * Starts the agent session of a stopped chat again, as a new chat that takes
 * over the stopped one. Resolves to the new chat's session id; when the agent
 * session already runs in another chat, the host hands that one back.
 */
export async function resumeChat(
	transport: Pick<ChatTransport, "closeSession" | "createSession">,
	input: ResumeChatInput,
): Promise<string> {
	await transport
		.closeSession({ sessionId: input.sessionId })
		.catch(() => undefined);
	const created = await transport.createSession({
		commandId: input.commandId,
		workspaceId: input.workspaceId,
		harness: input.harness,
		resume: {
			harnessSessionId: input.harnessSessionId,
			replacesSessionId: input.sessionId,
		},
	});
	return created.sessionId;
}
