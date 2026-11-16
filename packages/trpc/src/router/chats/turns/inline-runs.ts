import {
	claimTurn,
	finishTurn,
	isTurnSettled,
	startTurn,
	stopIfIdle,
	type TurnDeps,
	type TurnRuns,
	wakeForTurn,
} from "./engine";
import { runTurnFlow } from "./flow";

/** A wake-up that is kept when it fires before anyone waits for it. */
function signal() {
	let fired = false;
	let wake: (() => void) | null = null;
	return {
		fire() {
			fired = true;
			wake?.();
		},
		wait(ms: number) {
			if (fired) {
				fired = false;
				return Promise.resolve(true);
			}
			return new Promise<boolean>((resolve) => {
				const timer = setTimeout(() => {
					wake = null;
					resolve(false);
				}, ms);
				timer.unref?.();
				wake = () => {
					clearTimeout(timer);
					wake = null;
					fired = false;
					resolve(true);
				};
			});
		},
	};
}

/**
 * Turn runs in this process: the real steps and flow, with in-memory signals
 * and timers for the waits. A run is lost if the process stops, so this suits
 * one long-lived process (local development, tests), not serverless requests.
 */
export function inlineTurnRuns(getDeps: () => TurnDeps): TurnRuns & {
	/** Resolves when every run started so far has ended. */
	idle(): Promise<void>;
} {
	const signals = new Map<
		string,
		{ settled: ReturnType<typeof signal>; free: ReturnType<typeof signal> }
	>();
	const of = (turnId: string) => {
		let entry = signals.get(turnId);
		if (!entry) {
			entry = { settled: signal(), free: signal() };
			signals.set(turnId, entry);
		}
		return entry;
	};
	const pending = new Set<Promise<unknown>>();
	return {
		async start(turnId) {
			const deps = getDeps();
			const run = runTurnFlow(turnId, {
				claim: (id) => claimTurn(deps, id),
				wake: (id) => wakeForTurn(deps, id),
				start: (id) => startTurn(deps, id),
				isSettled: (id) => isTurnSettled(id),
				finish: (id, opts) => finishTurn(deps, id, opts),
				untilFree: async (ms) => {
					await of(turnId).free.wait(ms);
				},
				untilSettled: (ms) => of(turnId).settled.wait(ms),
			}).finally(() => signals.delete(turnId));
			const tracked = run.catch((error: unknown) =>
				console.error(`[chats] turn ${turnId} failed:`, error),
			);
			pending.add(tracked);
			void tracked.finally(() => pending.delete(tracked));
			return { outcome: () => run };
		},
		async idleStop(agentId) {
			const deps = getDeps();
			const timer = setTimeout(() => {
				void stopIfIdle(deps, agentId).catch((error: unknown) =>
					console.error(`[chats] idle stop of ${agentId} failed:`, error),
				);
			}, deps.idleTimeoutMs + 1_000);
			timer.unref?.();
		},
		async settled(turnId) {
			of(turnId).settled.fire();
		},
		async free(turnId) {
			of(turnId).free.fire();
		},
		async idle() {
			while (pending.size > 0) await Promise.all([...pending]);
		},
	};
}
