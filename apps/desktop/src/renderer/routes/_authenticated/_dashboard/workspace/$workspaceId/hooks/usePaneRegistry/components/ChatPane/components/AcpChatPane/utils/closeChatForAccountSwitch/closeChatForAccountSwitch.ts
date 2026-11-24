import type { ChatTransport } from "@superset/chat/client";
import { CONTINUE_PROMPT } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";

type Transport = Pick<ChatTransport, "getQueue"> & {
	respondToUsageLimit(
		input: Parameters<ChatTransport["respondToUsageLimit"]>[0],
	): Promise<unknown>;
	closeSession(
		input: Parameters<ChatTransport["closeSession"]>[0],
	): Promise<unknown>;
};

/**
 * Resolves to the work the next session must run: the queue, or a plain
 * "Continue" when a usage limit held the session with nothing queued.
 */
export async function closeChatForAccountSwitch({
	transport,
	sessionId,
	setAccount,
}: {
	transport: Transport;
	sessionId: string;
	setAccount: () => Promise<unknown>;
}): Promise<UserContent[][]> {
	await transport.respondToUsageLimit({
		sessionId,
		commandId: crypto.randomUUID(),
		action: "cancel_resume_at_reset",
	});
	// Older hosts do not say that a limit holds the session.
	const { prompts, limited } = await transport.getQueue({ sessionId });
	await setAccount();
	await transport.closeSession({ sessionId });
	if (prompts.length === 0 && limited) {
		return [[{ type: "text", text: CONTINUE_PROMPT }]];
	}
	// Older hosts send no fullContent, only the visible parts.
	return prompts.map((prompt) => prompt.fullContent ?? prompt.content);
}
