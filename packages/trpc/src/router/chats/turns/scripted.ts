import type { Box, BoxProvider, RunnerClient, TurnStart } from "./boxes";

/** Boxes that exist only as a record in this process, for a runner that needs no sandbox. */
export function memoryBoxes(): BoxProvider {
	const running = new Map<string, Box>();
	return {
		async wake(agentId, { boxId }) {
			const box = { id: boxId, url: "" };
			running.set(agentId, box);
			return box;
		},
		async status(agentId) {
			return running.get(agentId) ?? null;
		},
		async stop(agentId) {
			running.delete(agentId);
		},
	};
}

export interface ScriptedCallbacks {
	reply(turn: TurnStart, text: string): Promise<unknown>;
	settle(turn: TurnStart, result: { answer: string }): Promise<void>;
}

/** What the scripted model says to a message: enough to show the loop works, and plainly not a real answer. */
export function scriptedReply(prompt: string): string {
	const said = prompt.split("\n").at(-1)?.trim() ?? "";
	return said
		? `(scripted test model) You said: "${said}"`
		: "(scripted test model) Hello.";
}

/**
 * A runner with no model: after a pause it replies with scripted text and
 * settles, so the whole turn loop runs without a sandbox or a model key. A new
 * prompt in a session cancels the one before it, as the real runner does.
 */
export function scriptedRunner(
	callbacks: ScriptedCallbacks,
	options: { thinkMs: number },
): RunnerClient {
	const sessions = new Map<string, AbortController>();
	return {
		async start(_box, turn) {
			sessions.get(turn.sessionId)?.abort();
			const abort = new AbortController();
			sessions.set(turn.sessionId, abort);
			const timer = setTimeout(() => {
				if (abort.signal.aborted) return;
				sessions.delete(turn.sessionId);
				void callbacks
					.reply(turn, scriptedReply(turn.text))
					.then(() => callbacks.settle(turn, { answer: "" }))
					.catch((error: unknown) =>
						console.error(`[chats] scripted turn ${turn.turnId}:`, error),
					);
			}, options.thinkMs);
			timer.unref?.();
		},
		async cancel(_box, { sessionId }) {
			sessions.get(sessionId)?.abort();
			sessions.delete(sessionId);
		},
	};
}
