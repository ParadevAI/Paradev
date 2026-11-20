import type { ChatRuntime } from "@superset/chat-runtime";
import { promptChatSession } from "../chat-v3/promptChatSession";
import {
	sendAgentMessage,
	type TerminalSessionError,
} from "../terminal/terminal";
import { matchesAgentBinding } from "./matches-agent-binding";
import type { TerminalAgentStore } from "./store";

type TerminalAgentMessage = Parameters<typeof sendAgentMessage>[0];

export async function sendToAgent({
	chatRuntime,
	...input
}: Omit<TerminalAgentMessage, "terminalAgentStore"> & {
	terminalAgentStore: Pick<TerminalAgentStore, "get" | "getChat">;
	chatRuntime: () => ChatRuntime | undefined;
}): Promise<{ success: true } | TerminalSessionError> {
	const chat = input.terminalAgentStore.getChat(input.terminalId);
	const chatSessionId = chat?.chatSessionId;
	if (!chat || !chatSessionId) return sendAgentMessage(input);

	if (chat.workspaceId !== input.workspaceId) {
		return {
			kind: "SESSION_WRONG_WORKSPACE",
			error: "Agent does not belong to this workspace",
		};
	}
	if (input.expectedAgent && !matchesAgentBinding(chat, input.expectedAgent)) {
		return {
			kind: "SESSION_NOT_ACTIVE",
			error: "The chat's agent changed before delivery",
		};
	}
	if (!input.submit || input.text.trim() === "") {
		return {
			kind: "CHAT_NEEDS_SUBMITTED_TEXT",
			error: "A chat takes a message to send, not text to leave in its input",
		};
	}
	const runtime = chatRuntime();
	if (!runtime) {
		return {
			kind: "SESSION_NOT_ACTIVE",
			error: "Chat sessions are not available on this host",
		};
	}
	try {
		await promptChatSession({
			runtime,
			chatSessionId,
			text: input.text,
			acquireDelivery:
				input.acquireDelivery ?? (async () => ({ isValid: () => true })),
			signal: input.signal ?? new AbortController().signal,
		});
	} catch (error) {
		return {
			kind: "SESSION_NOT_ACTIVE",
			error: error instanceof Error ? error.message : String(error),
		};
	}
	return { success: true };
}
