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
	turnSteersQuery,
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
import type {
	AgentActivities,
	TurnPrompt,
} from "../../activities/createActivities";

const IDLE_EXIT = "10 minutes";
const SEEN_PROMPT_IDS = 500;
const PENDING_STEER_WAIT = "1 minute";
const UNFINISHED_SETTLE_ATTEMPTS = 5;

const quick = proxyActivities<AgentActivities>({
	startToCloseTimeout: "30 seconds",
	retry: { maximumAttempts: 10 },
});
/**
 * A retry resumes pdev's saved session; it never sends the prompt again.
 * Attempts have no limit: a provider outage or a lost credential must not drop
 * the messages in the turn, and messages that arrive meanwhile join it.
 */
const pdev = proxyActivities<AgentActivities>({
	startToCloseTimeout: "2 hours",
	heartbeatTimeout: "1 minute",
	cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
	retry: {
		initialInterval: "5 seconds",
		backoffCoefficient: 2,
		maximumInterval: "5 minutes",
		nonRetryableErrorTypes: ["PdevTurnError", "BadSessionId"],
	},
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
 * One agent session. Turns come from the API one at a time and pdev runs
 * each one; a message sent while a turn runs is a steer, which the running
 * turn reads through `turnSteersQuery`. The conversation lives in the
 * session store, so this history holds only ids and outcomes.
 */
export async function agentSession(args: AgentSessionArgs): Promise<void> {
	const { sessionId } = args;
	const pending: QueuedTurn[] = [...(args.carried?.pending ?? [])];
	const finished = new Set<string>();
	const interruptedEarly = new Set<string>();
	const seen = new Set<string>(args.carried?.seenPromptIds ?? []);
	let steers: SteerInput[] = [];
	let delivered = 0;
	let current: { turnId: string; scope: CancellationScope } | null = null;
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
			step: 0,
			activity,
			pendingTurns: pending.length,
		}),
	);
	setHandler(turnSteersQuery, (turnId) =>
		current?.turnId === turnId ? steers : [],
	);

	const runTurn = async (turn: StartTurnInput) => {
		const { turnId } = turn;
		await quick.beginTurn({
			sessionId,
			turnId,
			promptId: turn.promptId,
			text: turn.text,
		});
		const queued: TurnPrompt[] = steers.map((steer) => ({
			promptId: steer.promptId,
			text: steer.text,
			steer: true,
		}));
		let prompts: TurnPrompt[] = [
			{ promptId: turn.promptId, text: turn.text },
			...queued,
		];
		delivered = steers.length;
		for (;;) {
			activity = "working";
			const ran = await pdev.runTurn({
				sessionId,
				turnId,
				prompts,
				steersFrom: delivered,
			});
			delivered = ran.steersConsumed;
			if (steers.length > delivered) {
				prompts = steers.slice(delivered).map((steer) => ({
					promptId: steer.promptId,
					text: steer.text,
					steer: true,
				}));
				delivered = steers.length;
				continue;
			}
			activity = "settling";
			const settled = await quick.settleTurn({
				sessionId,
				turnId,
				outcome: "completed",
				steersConsumed: delivered,
			});
			if (!settled.steerPending) return;
			// The API recorded a steer that has not reached this workflow yet.
			await condition(() => steers.length > delivered, PENDING_STEER_WAIT);
			prompts = steers.slice(delivered).map((steer) => ({
				promptId: steer.promptId,
				text: steer.text,
				steer: true,
			}));
			delivered = steers.length;
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
			const unread = steers.slice(delivered);
			delivered = steers.length;
			if (unread.length > 0) {
				await quick.addSteers({ sessionId, turnId, steers: unread });
			}
			const settled = await quick.settleTurn({
				sessionId,
				turnId,
				steersConsumed: delivered,
				...end,
			});
			if (!settled.steerPending) return;
			await condition(() => steers.length > delivered, PENDING_STEER_WAIT);
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
		delivered = 0;
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
			delivered = 0;
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
