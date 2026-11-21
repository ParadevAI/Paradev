import { CONTINUE_PROMPT } from "@superset/chat/core";
import type { ChatRuntime } from "@superset/chat-runtime";
import type { ClosedChat } from "./resumeAfterUpdate";

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
	/** The set of chats waiting for an answer changed. */
	onChange?: () => void;
}) {
	const chats = new Map<string, ClosedChat>();
	const forget = (sessionId: string) => {
		if (chats.delete(sessionId)) options.onChange?.();
	};

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
		if (!live || live.promptsSent > 0) return null;
		const replacement = runtime.sessions.get(live.sessionId);
		return {
			sessionId: live.sessionId,
			title: replacement?.title ?? null,
			replaced: true,
		};
	};

	const resumeOne = async (chat: ClosedChat, paused: Paused) => {
		const runtime = options.runtime();
		const continued = [
			...(chat.interrupted ? [CONTINUE] : []),
			...chat.prompts,
		];
		const onlyQueue = continued.length === 0;
		const prompts = onlyQueue ? chat.pausedPrompts : continued;
		const pausedPrompts = onlyQueue ? [] : chat.pausedPrompts;
		if (paused.replaced) {
			runtime.live
				.require(paused.sessionId)
				.promptOnceStarted(prompts, pausedPrompts);
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
			prompts,
			pausedPrompts,
			replacesSessionId: chat.sessionId,
		});
		await runtime.commands.closeSession({ sessionId: chat.sessionId });
	};

	return {
		add(chat: ClosedChat): void {
			chats.set(chat.sessionId, chat);
			options.onChange?.();
		},

		/** The chats still waiting, as last recorded. */
		pending(): ClosedChat[] {
			return [...chats.values()];
		},

		list(): ClosedMidTurnChat[] {
			const open: ClosedMidTurnChat[] = [];
			for (const chat of chats.values()) {
				const paused = pausedIn(chat);
				if (!paused) {
					forget(chat.sessionId);
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
					forget(chat.sessionId);
					continue;
				}
				try {
					await resumeOne(chat, paused);
					forget(chat.sessionId);
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
			options.onChange?.();
		},
	};
}
