import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { Task } from "@superset/chats-core";
import type { RealtimeEvent, SyncSignal } from "../api-types/api-types.ts";
import {
	applySessionUpdate,
	askedDevId,
	EMPTY_STREAM,
	type TurnStream,
	toolRunning,
} from "../live-turn/live-turn.ts";

/** A Dev working in a group: waking its box, then running a turn whose stream the app may be watching. */
export interface LiveTurn {
	devId: string;
	groupId: string;
	/** Null while the box wakes; `turn.started` names the turn. */
	turnId: string | null;
	/** Set for a `dev ask` turn: the asking Dev's turn. */
	parentTurnId: string | null;
	phase: "waking" | "running";
	stream: TurnStream;
	/** When this client first heard of the turn (ms); a bootstrap fetched earlier can't end it. */
	since: number;
}

export interface LiveTurns {
	active: LiveTurn[];
	/** Recently ended turns, newest last: a `dev ask` that's over still shows inside the asking turn. */
	finished: LiveTurn[];
	/** Trigger turns running now: quiet work that never shows as "working" in the chat (it ends as a batch). */
	quiet: QuietTurn[];
}

/** A trigger turn, kept so its box's status and its `turn.ended` don't bring up (or end) a live row. */
export interface QuietTurn {
	devId: string;
	groupId: string;
	turnId: string;
}

/** What drives the live state: the sync store's signals (realtime events, bootstraps) and box stream updates. */
export type LiveAction =
	| SyncSignal
	| { type: "update"; turnId: string; update: SessionUpdate };

export const EMPTY_LIVE: LiveTurns = { active: [], finished: [], quiet: [] };

/** How long a new Dev's "getting ready" row outlasts bootstraps that find it still at rest. */
const FIRST_TURN_GRACE_MS = 30_000;

/** Enough for the asks of the turns running now, without holding every stream for the session's lifetime. */
const FINISHED_LIMIT = 20;

const same = (
	turn: Pick<LiveTurn, "devId" | "groupId">,
	devId: string,
	groupId: string,
) => turn.devId === devId && turn.groupId === groupId;

function finish(
	state: LiveTurns,
	ended: (turn: LiveTurn) => boolean,
): LiveTurns {
	const done = state.active.filter(ended);
	if (!done.length) return state;
	// A turn that never reached its stream has nothing to reopen.
	const kept = done.filter((t) => t.stream.blocks.length > 0);
	return {
		...state,
		active: state.active.filter((t) => !ended(t)),
		finished: [...state.finished, ...kept].slice(-FINISHED_LIMIT),
	};
}

function upsert(
	state: LiveTurns,
	devId: string,
	groupId: string,
	change: (turn: LiveTurn | null) => LiveTurn,
): LiveTurns {
	const existing = state.active.find((t) => same(t, devId, groupId)) ?? null;
	const next = change(existing);
	return {
		...state,
		active: existing
			? state.active.map((t) => (t === existing ? next : t))
			: [...state.active, next],
	};
}

/** Drops the trigger turns of a Dev in a group: one turn runs per Dev, so whatever comes next isn't one of them. */
function unquiet(state: LiveTurns, devId: string, groupId: string): LiveTurns {
	const quiet = state.quiet.filter((q) => !same(q, devId, groupId));
	return quiet.length === state.quiet.length ? state : { ...state, quiet };
}

/**
 * A trigger turn starting: the "waking" row its box brought up (before the server could say whose turn it was) goes
 * without a trace, and the turn is remembered as quiet until it ends.
 */
function startQuiet(
	state: LiveTurns,
	{ devId, groupId, turnId }: QuietTurn,
): LiveTurns {
	if (state.quiet.some((q) => q.turnId === turnId)) return state;
	const active = state.active.filter(
		(t) => !(same(t, devId, groupId) && t.turnId === null),
	);
	return {
		...state,
		active,
		quiet: [
			...unquiet(state, devId, groupId).quiet,
			{ devId, groupId, turnId },
		],
	};
}

const isQuiet = (state: LiveTurns, devId: string, groupId: string) =>
	state.quiet.some((q) => same(q, devId, groupId));

const fresh = (devId: string, groupId: string, since: number): LiveTurn => ({
	devId,
	groupId,
	turnId: null,
	parentTurnId: null,
	phase: "waking",
	stream: EMPTY_STREAM,
	since,
});

function applyEvent(
	state: LiveTurns,
	event: RealtimeEvent,
	at: number,
): LiveTurns {
	switch (event.type) {
		case "dev.status": {
			const { devId, groupId, status } = event;
			if (
				(status === "waking" || status === "running") &&
				isQuiet(state, devId, groupId)
			)
				return state;
			if (status === "waking")
				return upsert(
					state,
					devId,
					groupId,
					(t) => t ?? fresh(devId, groupId, at),
				);
			if (status === "running")
				return upsert(state, devId, groupId, (t) => ({
					...(t ?? fresh(devId, groupId, at)),
					phase: "running",
				}));
			// Idle or stopped: whatever this client thought was running there is over (also covers a missed `turn.ended`).
			return finish(unquiet(state, devId, groupId), (t) =>
				same(t, devId, groupId),
			);
		}
		case "turn.started": {
			const { devId, groupId, turnId, parentTurnId, triggerId } = event;
			if (triggerId) return startQuiet(state, { devId, groupId, turnId });
			return upsert(unquiet(state, devId, groupId), devId, groupId, (t) => ({
				...(t ?? fresh(devId, groupId, at)),
				// A new turn (a newer message restarted it) starts with an empty stream.
				...(t?.turnId && t.turnId !== turnId ? { stream: EMPTY_STREAM } : {}),
				turnId,
				parentTurnId: parentTurnId ?? null,
				phase: "running",
			}));
		}
		case "turn.ended":
			if (
				event.triggerId ||
				state.quiet.some((q) => q.turnId === event.turnId)
			) {
				const quiet = state.quiet.filter((q) => q.turnId !== event.turnId);
				return quiet.length === state.quiet.length
					? state
					: { ...state, quiet };
			}
			return finish(state, (t) => same(t, event.devId, event.groupId));
		// The turn's last words arrive as the message: its live view would show them twice until `turn.ended`. A row whose
		// turn this client never heard start (a new Dev's first) is that Dev's in that chat.
		case "message.created": {
			const { turnId, authorDevId, groupId } = event.message;
			if (!event.endsTurn || !turnId) return state;
			return finish(
				state,
				(t) =>
					t.turnId === turnId ||
					(t.turnId === null &&
						authorDevId !== null &&
						same(t, authorDevId, groupId)),
			);
		}
		default:
			return state;
	}
}

/** The app's view of every Dev at work in its chats. Pure, so it's tested without sockets or React. */
export function liveTurnsReducer(
	state: LiveTurns,
	action: LiveAction,
): LiveTurns {
	switch (action.type) {
		case "event":
			return applyEvent(state, action.event, action.at);
		// Getting ready from now, and for a while a bootstrap that still finds the Dev at rest (its box not yet waking)
		// doesn't end it: the turn is on its way.
		case "first-turn":
			return upsert(
				state,
				action.devId,
				action.groupId,
				(t) =>
					t ??
					fresh(action.devId, action.groupId, action.at + FIRST_TURN_GRACE_MS),
			);
		case "bootstrapped": {
			const resting = new Set(
				action.devs
					.filter((m) => m.status === "idle" || m.status === "stopped")
					.map((m) => m.id),
			);
			const quiet = state.quiet.filter((q) => !resting.has(q.devId));
			return finish(
				quiet.length === state.quiet.length ? state : { ...state, quiet },
				(t) => resting.has(t.devId) && t.since <= action.requestedAt,
			);
		}
		case "update": {
			const turn = state.active.find((t) => t.turnId === action.turnId);
			if (!turn) return state;
			const stream = applySessionUpdate(
				turn.stream,
				action.turnId,
				action.update,
			);
			return stream === turn.stream
				? state
				: {
						...state,
						active: state.active.map((t) =>
							t === turn ? { ...t, stream } : t,
						),
					};
		}
	}
}

/** Groups where a Dev is working right now, for the sidebar's activity dot. */
export function workingGroupIds(state: LiveTurns): Set<string> {
	return new Set(state.active.map((t) => t.groupId));
}

/**
 * Whether a task's Dev is at work on it: the task is in progress and its Dev has a turn running in the task's
 * chat (turn events don't name the task, so a Dev answering a message there while on the task reads as working).
 */
export function workingOnTask(
	state: LiveTurns,
	task: Pick<Task, "chatId" | "assigneeDevId" | "status">,
): boolean {
	return (
		task.status === "in_progress" &&
		!!task.assigneeDevId &&
		state.active.some(
			(t) => t.groupId === task.chatId && t.devId === task.assigneeDevId,
		)
	);
}

/** Whether `turn` is the nested turn of a `dev ask` in `parent` (same group, the asked Dev). */
function isNestedIn(turn: LiveTurn, parent: LiveTurn, askDevId: string) {
	if (turn.groupId !== parent.groupId || turn.devId !== askDevId) return false;
	// Before `turn.started` names the parent, a waking turn of the Dev being asked right now is that ask.
	return turn.parentTurnId
		? turn.parentTurnId === parent.turnId
		: turn.turnId === null;
}

/** The turn a `dev ask` tool call started on the asked Dev, live or recently finished. */
export function nestedTurn(
	state: LiveTurns,
	parent: LiveTurn,
	askDevId: string,
): LiveTurn | undefined {
	return [...state.active, ...state.finished].find((t) =>
		isNestedIn(t, parent, askDevId),
	);
}

/**
 * Turns shown as their own "working" item in a chat: every live turn there except the nested `dev ask` ones.
 * `devs` (the chat's) resolve an ask by name.
 */
export function chatTurns(
	state: LiveTurns,
	groupId: string,
	devs: { id: string; name: string }[],
): LiveTurn[] {
	const asking = state.active.flatMap((parent) =>
		parent.groupId === groupId
			? parent.stream.blocks.flatMap((b) => {
					const askDevId =
						b.kind === "tool" && b.ask && toolRunning(b)
							? askedDevId(b.ask, devs)
							: null;
					return askDevId ? [{ parent, askDevId }] : [];
				})
			: [],
	);
	return state.active.filter(
		(t) =>
			t.groupId === groupId &&
			!t.parentTurnId &&
			!asking.some(
				({ parent, askDevId }) =>
					parent !== t && isNestedIn(t, parent, askDevId),
			),
	);
}
