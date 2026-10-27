import {
	type AgentSessionArgs,
	interruptSignal,
	MAX_PROMPT_CHARS,
	type SessionState,
	type StartTurnInput,
	type SteerInput,
	startTurnUpdate,
	stateQuery,
	steerUpdate,
} from "@superset/agent-harness/session/definitions";
import {
	ActivityCancellationType,
	ActivityFailure,
	ApplicationFailure,
	allHandlersFinished,
	CancellationScope,
	condition,
	continueAsNew,
	isCancellation,
	log,
	proxyActivities,
	setHandler,
	workflowInfo,
} from "@temporalio/workflow";
import type { AgentActivities } from "../../activities/createActivities";

const IDLE_EXIT = "10 minutes";
const MAX_STEPS_PER_TURN = 200;
const SEEN_PROMPT_IDS = 500;
const PENDING_STEER_WAIT = "1 minute";
const UNFINISHED_SETTLE_ATTEMPTS = 5;

const quick = proxyActivities<AgentActivities>({
	startToCloseTimeout: "30 seconds",
	retry: { maximumAttempts: 10 },
});
const model = proxyActivities<AgentActivities>({
	startToCloseTimeout: "10 minutes",
	heartbeatTimeout: "1 minute",
	retry: {
		maximumAttempts: 5,
		nonRetryableErrorTypes: ["UsageLimitError", "ModelRefusedError"],
	},
});
const tools = proxyActivities<AgentActivities>({
	startToCloseTimeout: "30 minutes",
	heartbeatTimeout: "1 minute",
	cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
	retry: { maximumAttempts: 20, maximumInterval: "1 minute" },
});

type QueuedTurn = StartTurnInput & { steers?: SteerInput[] };

function validatePrompt(input: {
	text: string;
	promptId: string;
	turnId: string;
}) {
	if (!input.text.trim()) throw new Error("Empty prompt");
	if (input.text.length > MAX_PROMPT_CHARS) throw new Error("Prompt too long");
	if (!input.promptId || !input.turnId)
		throw new Error("Missing prompt or turn id");
}

/**
 * One agent session. Turns come from the API one at a time; a message sent
 * while a turn runs is a steer and joins it before its next model call.
 * The conversation itself lives in the session store, so this history holds
 * only ids and outcomes.
 */
export async function agentSession(args: AgentSessionArgs): Promise<void> {
	const { sessionId } = args;
	const pending: QueuedTurn[] = [...(args.carried?.pending ?? [])];
	const finished = new Set<string>();
	const interruptedEarly = new Set<string>();
	const seen = new Set<string>(args.carried?.seenPromptIds ?? []);
	let steers: SteerInput[] = [];
	let steersConsumed = 0;
	let current: { turnId: string; scope: CancellationScope } | null = null;
	let step = 0;
	let activity: string | null = null;

	const remember = (promptId: string): boolean => {
		if (seen.has(promptId)) return false;
		seen.add(promptId);
		if (seen.size > SEEN_PROMPT_IDS) {
			const oldest = seen.values().next().value;
			if (oldest !== undefined) seen.delete(oldest);
		}
		return true;
	};

	setHandler(
		startTurnUpdate,
		(input) => {
			if (!remember(input.promptId)) return "duplicate";
			pending.push(input);
			return "accepted";
		},
		{ validator: validatePrompt },
	);
	setHandler(
		steerUpdate,
		(input) => {
			if (!remember(input.promptId)) return "duplicate";
			if (current?.turnId === input.turnId) {
				steers.push(input);
				return "steered";
			}
			const queued = pending.find((turn) => turn.turnId === input.turnId);
			if (queued) {
				queued.steers = [...(queued.steers ?? []), input];
				return "steered";
			}
			if (finished.has(input.turnId)) return "duplicate";
			pending.push(input);
			return "started";
		},
		{ validator: validatePrompt },
	);
	setHandler(interruptSignal, ({ turnId }) => {
		if (current && (!turnId || turnId === current.turnId))
			current.scope.cancel();
		else if (turnId && pending.some((turn) => turn.turnId === turnId))
			interruptedEarly.add(turnId);
	});
	setHandler(
		stateQuery,
		(): SessionState => ({
			status: current ? "running" : "idle",
			turnId: current?.turnId ?? null,
			step,
			activity,
			pendingTurns: pending.length,
		}),
	);

	const runTurn = async (turn: StartTurnInput) => {
		const { turnId } = turn;
		await quick.beginTurn({
			sessionId,
			turnId,
			promptId: turn.promptId,
			text: turn.text,
		});
		step = 0;
		for (;;) {
			if (steers.length > 0) {
				const batch = steers;
				steers = [];
				steersConsumed += batch.length;
				activity = "steering";
				await quick.addSteers({ sessionId, turnId, steers: batch });
			}
			if (step >= MAX_STEPS_PER_TURN) {
				throw ApplicationFailure.nonRetryable(
					`Stopped after ${MAX_STEPS_PER_TURN} steps`,
					"StepLimitError",
				);
			}
			activity = "thinking";
			const result = await model.modelStep({ sessionId, turnId, step });
			for (const call of result.toolCalls) {
				activity = call.name;
				await tools.toolStep({ sessionId, turnId, step, toolCallId: call.id });
			}
			step += 1;
			if (result.toolCalls.length > 0 || steers.length > 0) continue;
			activity = "settling";
			const settled = await quick.settleTurn({
				sessionId,
				turnId,
				outcome: "completed",
				steersConsumed,
			});
			if (!settled.steerPending) return;
			// The API recorded a steer that has not reached this workflow yet.
			await condition(() => steers.length > 0, PENDING_STEER_WAIT);
		}
	};

	/**
	 * Settles a turn that stopped early. Steers still on their way are written
	 * to the log unanswered, so the API sees them read and lets the turn end.
	 */
	const settleUnfinished = async (
		turnId: string,
		end: { outcome: "failed" | "interrupted"; errorMessage?: string },
	) => {
		for (let attempt = 0; attempt < UNFINISHED_SETTLE_ATTEMPTS; attempt++) {
			const settled = await quick.settleTurn({
				sessionId,
				turnId,
				steersConsumed,
				...end,
			});
			if (!settled.steerPending) return;
			await condition(() => steers.length > 0, PENDING_STEER_WAIT);
			const batch = steers;
			steers = [];
			steersConsumed += batch.length;
			if (batch.length > 0) {
				await quick.addSteers({ sessionId, turnId, steers: batch });
			}
		}
		throw ApplicationFailure.nonRetryable(
			`Turn ${turnId} has steers that never reached the workflow`,
			"SteerLost",
		);
	};

	for (;;) {
		const hasWork = await condition(() => pending.length > 0, IDLE_EXIT);
		if (!hasWork) return;
		const turn = pending.shift();
		if (!turn) continue;

		const scope = new CancellationScope();
		current = { turnId: turn.turnId, scope };
		steers = turn.steers ?? [];
		steersConsumed = 0;
		if (interruptedEarly.delete(turn.turnId)) scope.cancel();
		try {
			await scope.run(() => runTurn(turn));
		} catch (error) {
			const cancelled = isCancellation(error);
			// One turn that cannot be settled must not end the session for every later turn.
			await CancellationScope.nonCancellable(() =>
				settleUnfinished(turn.turnId, {
					outcome: cancelled ? "interrupted" : "failed",
					...(cancelled ? {} : { errorMessage: failureMessage(error) }),
				}),
			).catch((settleError: unknown) =>
				log.error("Could not settle turn", {
					turnId: turn.turnId,
					error: failureMessage(settleError),
				}),
			);
		} finally {
			finished.add(turn.turnId);
			if (finished.size > SEEN_PROMPT_IDS) {
				const oldest = finished.values().next().value;
				if (oldest !== undefined) finished.delete(oldest);
			}
			current = null;
			activity = null;
			steers = [];
		}

		if (workflowInfo().continueAsNewSuggested) {
			await condition(allHandlersFinished);
			await continueAsNew<typeof agentSession>({
				sessionId,
				carried: { pending, seenPromptIds: [...seen] },
			});
		}
	}
}

function failureMessage(error: unknown): string {
	if (error instanceof ActivityFailure && error.cause)
		return error.cause.message;
	return error instanceof Error ? error.message : String(error);
}
