import { env } from "../../../env";
import { postDevMessage, settleTurn, type TurnDeps } from "./engine";
import { inlineTurnRuns } from "./inline-runs";
import { memoryBoxes, scriptedRunner } from "./scripted";

const IDLE_TIMEOUT_MS = 10 * 60_000;
const SCRIPTED_THINK_MS = 1_500;

let runtime: TurnDeps | null | undefined;

/** Development's runtime: turns run in this process against a scripted model. */
function scriptedRuntime(): TurnDeps {
	const deps: TurnDeps = {
		boxes: memoryBoxes(),
		runner: scriptedRunner(
			{
				reply: (turn, text) => postDevMessage(turn, { text, endsTurn: true }),
				settle: (turn, result) => settleTurn(deps, turn, result),
			},
			{ thinkMs: SCRIPTED_THINK_MS },
		),
		turnRuns: inlineTurnRuns(() => deps),
		idleTimeoutMs: IDLE_TIMEOUT_MS,
	};
	return deps;
}

/**
 * What runs Devs' turns here, or null where nothing does yet. Only local
 * development has one: the durable runs and sandboxes a deployment needs are
 * not built, so there a message starts no turn.
 */
export function chatsTurnRuntime(): TurnDeps | null {
	if (runtime === undefined) {
		runtime = env.NODE_ENV === "development" ? scriptedRuntime() : null;
	}
	return runtime;
}

/** Replaces the runtime, for tests. */
export function setChatsTurnRuntime(next: TurnDeps | null) {
	runtime = next;
}
