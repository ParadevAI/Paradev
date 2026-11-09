import type {
	DurableEvent,
	Item,
	SessionState,
	Turn,
} from "@superset/chat/protocol";
import { searchTextForItem } from "../searchText";

export type PushedEvent = { seq: number; ts: number; event: DurableEvent };

export type FoldedItem = {
	itemId: string;
	turnId: string;
	kind: string;
	seq: number;
	firstSeq: number;
	startedAt: Date | null;
	body: Item;
	searchText: string;
};

export type FoldedTurn = {
	turnId: string;
	seq: number;
	firstSeq: number;
	status: string;
	startedAt: Date | null;
	completedAt: Date | null;
	usage: Turn["usage"] | null;
	body: Turn;
};

export type FoldedBatch = {
	items: FoldedItem[];
	turns: FoldedTurn[];
	session: { seq: number; state: SessionState } | null;
	lastSeq: number;
};

function dateOf(ms: number | undefined): Date | null {
	if (typeof ms !== "number") return null;
	const date = new Date(ms);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** Keeps the newest version of each item and turn, and where each first appeared. */
export function foldEvents(events: readonly PushedEvent[]): FoldedBatch {
	const items = new Map<string, FoldedItem>();
	const turns = new Map<string, FoldedTurn>();
	let session: FoldedBatch["session"] = null;
	let lastSeq = 0;

	for (const { seq, event } of [...events].sort((a, b) => a.seq - b.seq)) {
		lastSeq = Math.max(lastSeq, seq);
		if (event.type === "item") {
			const prior = items.get(event.item.id);
			items.set(event.item.id, {
				itemId: event.item.id,
				turnId: event.turnId,
				kind: event.item.kind,
				seq,
				firstSeq: prior?.firstSeq ?? seq,
				startedAt: dateOf(event.item.startedAtMs),
				body: event.item,
				searchText: searchTextForItem(event.item),
			});
		} else if (event.type === "turn") {
			const prior = turns.get(event.turn.id);
			turns.set(event.turn.id, {
				turnId: event.turn.id,
				seq,
				firstSeq: prior?.firstSeq ?? seq,
				status: event.turn.status,
				startedAt: dateOf(event.turn.startedAtMs),
				completedAt: dateOf(event.turn.completedAtMs),
				usage: event.turn.usage ?? null,
				body: event.turn,
			});
		} else {
			const { availableCommands: _commands, ...state } = event.session;
			session = { seq, state };
		}
	}

	return {
		items: [...items.values()],
		turns: [...turns.values()],
		session,
		lastSeq,
	};
}
