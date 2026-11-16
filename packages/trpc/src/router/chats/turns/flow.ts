/** How long a turn may run before it is stopped. */
export const TURN_MAX_MS = 30 * 60_000;
/** A queued turn is woken when its Dev frees up; this re-check covers a wake-up that got lost. */
const FREE_RECHECK_MS = 5_000;
/** A running turn is woken by the runner's callback; this re-check covers a callback whose wake-up got lost. */
const SETTLED_RECHECK_MS = 60_000;

/** How a turn ended: the Dev's final text, why it failed, or that a newer message replaced it. */
export type TurnOutcome =
	| { answer: string }
	| { error: string; busy?: true }
	| { cancelled: true };

/** A claim: the turn runs now, waits for its Dev, or is over. */
export type Claim =
	| { kind: "run" }
	| { kind: "wait" }
	| { kind: "done"; outcome: TurnOutcome };

export interface TurnFlow {
	claim(turnId: string): Promise<Claim>;
	wake(turnId: string): Promise<boolean>;
	start(turnId: string): Promise<boolean>;
	/** Whether the turn has settled or was superseded, by the database, for when a wake-up got lost. */
	isSettled(turnId: string): Promise<boolean>;
	finish(turnId: string, opts: { timedOut: boolean }): Promise<TurnOutcome>;
	/** Resolves when the Dev may have freed up, or after `ms`. */
	untilFree(ms: number): Promise<void>;
	/** True when the turn settled or was superseded, false after `ms`. */
	untilSettled(ms: number): Promise<boolean>;
}

/**
 * One turn, start to end: claim the Dev (waiting while it runs another turn),
 * wake its box, hand the turn to the runner, wait for the runner's callback,
 * then finish.
 */
export async function runTurnFlow(
	turnId: string,
	flow: TurnFlow,
): Promise<TurnOutcome> {
	for (;;) {
		const claimed = await flow.claim(turnId);
		if (claimed.kind === "done") return claimed.outcome;
		if (claimed.kind === "run") break;
		await flow.untilFree(FREE_RECHECK_MS);
	}
	if (!(await flow.wake(turnId)) || !(await flow.start(turnId))) {
		return flow.finish(turnId, { timedOut: false });
	}
	for (let waited = 0; waited < TURN_MAX_MS; waited += SETTLED_RECHECK_MS) {
		if (
			(await flow.untilSettled(SETTLED_RECHECK_MS)) ||
			(await flow.isSettled(turnId))
		) {
			return flow.finish(turnId, { timedOut: false });
		}
	}
	return flow.finish(turnId, { timedOut: true });
}
