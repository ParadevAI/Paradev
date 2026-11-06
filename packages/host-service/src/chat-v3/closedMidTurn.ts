import { randomUUID } from "node:crypto";
import { CONTINUE_PROMPT } from "@superset/chat/core";
import type { ChatRuntime } from "@superset/chat-runtime";
import type { ClosedChat } from "./chatAgentBridge";

const CONTINUE = [{ type: "text" as const, text: CONTINUE_PROMPT }];

export type ClosedMidTurnChat = {
	sessionId: string;
	workspaceId: string;
	title: string | null;
};

type Paused = { sessionId: string; title: string | null; replaced: boolean };

export function createClosedMidTurn(options: {
	runtime: () => ChatRuntime;
	resolveCwd: (scopeId: string) => string;
}) {
	const chats = new Map<string, ClosedChat>();

	/**
	 * Where a paused chat lives now: its own session, or the one a reopened pane
	 * replaced it with, until someone continues it there.
	 */
	const pausedIn = (chat: ClosedChat): Paused | null => {
		const runtime = options.runtime();
		if (!runtime.live.supports(chat.harness)) return null;
		const row = runtime.sessions.get(chat.sessionId);
		if (row && !row.closedAt) {
			return { sessionId: chat.sessionId, title: row.title, replaced: false };
		}
		if (!chat.terminalId) return null;
		const live = runtime.live.forTerminal(chat.terminalId);
		const turn = live?.turn;
		if (
			!live ||
			turn?.status !== "interrupted" ||
			turn.error?.kind !== "host_stopped"
		)
			return null;
		const replacement = runtime.sessions.get(live.sessionId);
		return {
			sessionId: live.sessionId,
			title: replacement?.title ?? null,
			replaced: true,
		};
	};

	const resumeOne = async (chat: ClosedChat, paused: Paused) => {
		const runtime = options.runtime();
		if (paused.replaced) {
			runtime.commands.prompt({
				commandId: randomUUID(),
				sessionId: paused.sessionId,
				clientId: randomUUID(),
				content: CONTINUE,
			});
			return;
		}
		runtime.commands.resumeSession({
			scopeId: chat.scopeId,
			harness: chat.harness,
			harnessSessionId: chat.harnessSessionId,
			terminalId: chat.terminalId,
			modeId: chat.modeId,
			modelId: chat.modelId,
			cwd: options.resolveCwd(chat.scopeId),
			prompts: [CONTINUE],
			pausedPrompts: [],
			replacesSessionId: chat.sessionId,
		});
		await runtime.commands.closeSession({ sessionId: chat.sessionId });
	};

	return {
		add(chat: ClosedChat): void {
			chats.set(chat.sessionId, chat);
		},

		list(): ClosedMidTurnChat[] {
			const open: ClosedMidTurnChat[] = [];
			for (const chat of chats.values()) {
				const paused = pausedIn(chat);
				if (!paused) {
					chats.delete(chat.sessionId);
					continue;
				}
				open.push({
					sessionId: paused.sessionId,
					workspaceId: chat.scopeId,
					title: paused.title,
				});
			}
			return open;
		},

		async resume(): Promise<number> {
			let resumed = 0;
			for (const chat of [...chats.values()]) {
				const paused = pausedIn(chat);
				if (!paused) {
					chats.delete(chat.sessionId);
					continue;
				}
				try {
					await resumeOne(chat, paused);
					chats.delete(chat.sessionId);
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
