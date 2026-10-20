import { randomUUID } from "node:crypto";
import { runningTurnId, userMessageText } from "@superset/chat/core";
import { isKnownItem, type KnownItem } from "@superset/chat/protocol";
import type { ChatRuntime } from "@superset/chat-runtime";
import type { TerminalAgentStore } from "../terminal-agents";

const INTERRUPT_INPUTS = new Set(["\x1b", "\x03"]);

export interface ChatTerminal {
	runtime: ChatRuntime;
	chatSessionId: string;
}

/**
 * A chat session carries a terminal id so callers that speak in terminals
 * (the CLI, page watches) can address it, but no pty stands behind it.
 */
export function findChatTerminal(
	ctx: {
		runtime: { chat?: () => ChatRuntime };
		terminalAgentStore: Pick<TerminalAgentStore, "getChat">;
	},
	ref: { workspaceId: string; terminalId: string },
): ChatTerminal | null {
	const binding = ctx.terminalAgentStore.getChat(ref.terminalId);
	if (!binding?.chatSessionId || binding.workspaceId !== ref.workspaceId) {
		return null;
	}
	const runtime = ctx.runtime.chat?.();
	if (!runtime) return null;
	return { runtime, chatSessionId: binding.chatSessionId };
}

export function sendToChat(
	{ runtime, chatSessionId }: ChatTerminal,
	text: string,
): void {
	runtime.commands.prompt({
		commandId: randomUUID(),
		sessionId: chatSessionId,
		clientId: randomUUID(),
		content: [{ type: "text", text }],
	});
}

export function isChatInterruptInput(data: string): boolean {
	return INTERRUPT_INPUTS.has(data);
}

/** Returns false when no turn was running. */
export function interruptChat({
	runtime,
	chatSessionId,
}: ChatTerminal): boolean {
	const outline = runtime.commands.getOutline({ sessionId: chatSessionId });
	if (!outline.ok) return false;
	const turnId = runningTurnId(
		new Map(outline.outline.turns.map((turn) => [turn.id, turn])),
	);
	if (!turnId) return false;
	runtime.commands.cancelTurn({
		commandId: randomUUID(),
		sessionId: chatSessionId,
		turnId,
	});
	return true;
}

export function chatTranscriptText({
	runtime,
	chatSessionId,
}: ChatTerminal): string | null {
	const outline = runtime.commands.getOutline({ sessionId: chatSessionId });
	if (!outline.ok) return null;
	return outline.outline.items
		.flatMap(({ item }) => (isKnownItem(item) ? [itemText(item)] : []))
		.filter((text): text is string => Boolean(text))
		.join("\n\n");
}

function itemText(item: KnownItem): string | null {
	switch (item.kind) {
		case "user_message": {
			if (item.discarded) return null;
			const text = userMessageText(item).trim();
			if (!text) return null;
			return item.queued ? `User (queued): ${text}` : `User: ${text}`;
		}
		case "agent_message": {
			const text = item.text.trim();
			return text ? `Agent: ${text}` : null;
		}
		case "tool_call":
			return `[tool ${item.status}] ${item.title}`;
		case "approval_request":
			return item.status === "pending"
				? `[waiting for approval] ${item.title}`
				: null;
		case "notice":
			return item.noticeKind === "error" && item.text
				? `[error] ${item.text}`
				: null;
		default:
			return null;
	}
}
