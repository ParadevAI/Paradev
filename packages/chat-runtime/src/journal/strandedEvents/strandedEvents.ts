import type {
	DurableEnvelope,
	DurableEvent,
	Item,
	SessionState,
	Turn,
	TurnError,
} from "@superset/chat/protocol";

export const HOST_STOPPED: TurnError = {
	message: "Commands the agent was running were stopped.",
	kind: "host_stopped",
};

/** Settles only one stopped turn's own tool calls, leaving what went to the background. */
export type StoppedTurn = { turnId: string; background: ReadonlySet<string> };

export const ACTIVE_STATUSES = new Set<SessionState["status"]>([
	"starting",
	"running",
	"awaiting_input",
]);

/**
 * What the journal still owes a session whose agent is gone: anything left
 * running or pending is settled, so no reader waits on it.
 */
export function strandedEvents(
	envelopes: readonly DurableEnvelope[],
	options: {
		atMs: number;
		error?: TurnError;
		idle?: boolean;
		stoppedTurn?: StoppedTurn;
	},
): DurableEvent[] {
	const items = new Map<string, { item: Item; turnId: string }>();
	const turns = new Map<string, Turn>();
	let session: SessionState | null = null;
	for (const { event } of envelopes) {
		if (event.type === "item") {
			items.set(event.item.id, { item: event.item, turnId: event.turnId });
		} else if (event.type === "turn") {
			turns.set(event.turn.id, event.turn);
		} else {
			session = event.session;
		}
	}

	const events: DurableEvent[] = [];
	const stopped = options.stoppedTurn;
	for (const { item, turnId } of items.values()) {
		if (stopped && !ownedBy(stopped, item, turnId)) continue;
		const settled = settledItem(item, options.atMs);
		if (settled) events.push({ type: "item", item: settled, turnId });
	}
	if (stopped) return events;
	for (const turn of turns.values()) {
		if (turn.status !== "running") continue;
		events.push({
			type: "turn",
			turn: {
				...turn,
				status: "interrupted",
				completedAtMs: options.atMs,
				...(options.error ? { error: options.error } : {}),
			},
		});
	}
	if (options.idle && session && ACTIVE_STATUSES.has(session.status)) {
		events.push({
			type: "session",
			session: {
				...session,
				status: "idle",
				backgroundTasks: [],
				awaitingBackground: false,
			},
		});
	}
	return events;
}

function ownedBy(stopped: StoppedTurn, item: Item, turnId: string): boolean {
	return (
		turnId === stopped.turnId &&
		!item.parentItemId &&
		!(item.kind === "tool_call" && item.subagent) &&
		!stopped.background.has(item.id)
	);
}

function settledItem(item: Item, atMs: number): Item | null {
	if (item.kind === "tool_call" && item.status === "running") {
		return {
			...item,
			status: "canceled",
			completedAtMs: atMs,
			...(item.subagentStatus === "running"
				? { subagentStatus: "stopped" as const }
				: {}),
		};
	}
	if (item.kind === "approval_request" && item.status === "pending") {
		return { ...item, status: "stale", completedAtMs: atMs };
	}
	return null;
}
