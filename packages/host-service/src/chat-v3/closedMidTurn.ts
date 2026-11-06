import { CONTINUE_PROMPT } from "@superset/chat/core";
import type { ChatRuntime } from "@superset/chat-runtime";
import type { ClosedChat } from "./chatAgentBridge";

export type ClosedMidTurnChat = {
	sessionId: string;
	workspaceId: string;
	title: string | null;
};

export function createClosedMidTurn(options: {
	runtime: () => ChatRuntime;
	resolveCwd: (scopeId: string) => string;
}) {
	const chats = new Map<string, ClosedChat>();

	const stillWaiting = (chat: ClosedChat) => {
		const row = options.runtime().sessions.get(chat.sessionId);
		return row && !row.closedAt ? row : null;
	};

	return {
		add(chat: ClosedChat): void {
			chats.set(chat.sessionId, chat);
		},

		list(): ClosedMidTurnChat[] {
			if (chats.size === 0) return [];
			const open: ClosedMidTurnChat[] = [];
			for (const chat of chats.values()) {
				const row = stillWaiting(chat);
				if (!row) {
					chats.delete(chat.sessionId);
					continue;
				}
				open.push({
					sessionId: chat.sessionId,
					workspaceId: chat.scopeId,
					title: row.title,
				});
			}
			return open;
		},

		async resume(): Promise<number> {
			let resumed = 0;
			for (const chat of [...chats.values()]) {
				chats.delete(chat.sessionId);
				const runtime = options.runtime();
				if (!stillWaiting(chat) || !runtime.live.supports(chat.harness))
					continue;
				try {
					runtime.commands.resumeSession({
						scopeId: chat.scopeId,
						harness: chat.harness,
						harnessSessionId: chat.harnessSessionId,
						terminalId: chat.terminalId,
						cwd: options.resolveCwd(chat.scopeId),
						prompts: [[{ type: "text", text: CONTINUE_PROMPT }]],
						pausedPrompts: [],
						replacesSessionId: chat.sessionId,
					});
					await runtime.commands.closeSession({ sessionId: chat.sessionId });
					resumed++;
				} catch (error) {
					console.warn(
						"[chat-v3] could not resume a chat Paradev closed",
						error,
					);
				}
			}
			return resumed;
		},

		keepPaused(): void {
			chats.clear();
		},
	};
}
