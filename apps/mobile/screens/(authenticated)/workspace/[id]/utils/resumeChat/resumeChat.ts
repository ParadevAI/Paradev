import type { ChatTransport } from "@superset/chat/client";

/**
 * Starts a finished chat's agent session again under a new chat session, which
 * replaces the old one. Resolves to the new chat session id.
 */
export async function resumeChat({
	transport,
	workspaceId,
	chat,
	commandId,
}: {
	transport: Pick<ChatTransport, "closeSession" | "createSession">;
	workspaceId: string;
	chat: { sessionId: string; harness: string; harnessSessionId: string };
	commandId: string;
}): Promise<string> {
	await transport.closeSession({ sessionId: chat.sessionId }).catch(() => {});
	const created = await transport.createSession({
		commandId,
		workspaceId,
		harness: chat.harness,
		resume: {
			harnessSessionId: chat.harnessSessionId,
			replacesSessionId: chat.sessionId,
		},
	});
	return created.sessionId;
}
