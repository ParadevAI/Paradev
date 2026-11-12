import type { Turn } from "../../protocol/envelope";
import type {
	ApprovalRequest,
	Item,
	ToolCall,
	UserMessage,
} from "../../protocol/items";
import type { OutboxEntry } from "../outbox/outbox";
import type { SessionSnapshot } from "../reducer/reducer";
import { isSubagentCall } from "../subagents/subagents";

/** An item as a turn shows it: live text in place, and what it refers to attached. */
export type Part = Item & {
	/** The items a subagent call produced, in order. */
	children?: readonly Part[];
	/** The tool call an approval is about. */
	approvalTarget?: Part;
	/** The subagent that asked for an approval. */
	approvalAsker?: ToolCall;
};

export type ChatTurn = {
	id: string;
	/** Null until the host has written the turn. */
	turn: Turn | null;
	/** Set on a prompt sent from here that the host has not confirmed. */
	sending: "sending" | "failed" | null;
	parts: readonly Part[];
};

export type TurnsInput = Pick<
	SessionSnapshot,
	"items" | "turns" | "liveStreams"
>;

type PartSource = {
	item: Item;
	text: string | undefined;
	children: readonly Part[] | undefined;
	target: Part | undefined;
	asker: ToolCall | undefined;
	part: Part;
};

const NO_OUTBOX: readonly OutboxEntry[] = [];

function byStartThenId(a: Item, b: Item): number {
	if (a.startedAtMs !== b.startedAtMs) return a.startedAtMs - b.startedAtMs;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sameList<T>(
	previous: readonly T[] | undefined,
	next: readonly T[] | undefined,
): boolean {
	if (previous === next) return true;
	if (!previous || !next || previous.length !== next.length) return false;
	return previous.every((value, index) => value === next[index]);
}

function isSetAside(item: Item): boolean {
	if (item.kind !== "user_message") return false;
	const message = item as UserMessage;
	return message.queued === true || message.discarded === true;
}

function isPendingApproval(item: Item): boolean {
	return (
		item.kind === "approval_request" &&
		(item as ApprovalRequest).status === "pending"
	);
}

function hasLiveText(item: Item): boolean {
	return item.kind === "agent_message" || item.kind === "reasoning";
}

function pendingTurn(entry: OutboxEntry): ChatTurn {
	const message: UserMessage = {
		id: entry.clientId,
		kind: "user_message",
		clientId: entry.clientId,
		startedAtMs: 0,
		content: entry.content,
	};
	return {
		id: `pending:${entry.clientId}`,
		turn: null,
		sending: entry.state === "failed" ? "failed" : "sending",
		parts: [message],
	};
}

/**
 * Groups the log into turns. A turn, and every part in it, is the same object
 * as last time unless something it shows changed.
 */
export function createTurnDeriver(): (
	input: TurnsInput,
	outbox?: readonly OutboxEntry[],
) => readonly ChatTurn[] {
	let lastInput: TurnsInput | null = null;
	let lastOutbox: readonly OutboxEntry[] = NO_OUTBOX;
	let lastTurns: readonly ChatTurn[] = [];
	let sources = new Map<string, PartSource>();
	let turnsById = new Map<string, ChatTurn>();
	let pendingByEntry = new WeakMap<OutboxEntry, ChatTurn>();

	return (input, outbox = NO_OUTBOX) => {
		if (
			lastInput &&
			lastInput.items === input.items &&
			lastInput.turns === input.turns &&
			lastInput.liveStreams === input.liveStreams &&
			lastOutbox === outbox
		) {
			return lastTurns;
		}

		const { items, turns, liveStreams } = input;
		const childIds = new Map<string, Item[]>();
		for (const { item } of items.values()) {
			const parentId = item.parentItemId;
			if (!parentId || !items.has(parentId) || isSetAside(item)) continue;
			const siblings = childIds.get(parentId);
			if (siblings) siblings.push(item);
			else childIds.set(parentId, [item]);
		}
		for (const children of childIds.values()) children.sort(byStartThenId);

		const nextSources = new Map<string, PartSource>();
		const building = new Set<string>();
		const partOf = (item: Item): Part => {
			const done = nextSources.get(item.id);
			if (done) return done.part;
			if (building.has(item.id)) return item;
			building.add(item.id);

			const text = hasLiveText(item)
				? liveStreams.get(`text:${item.id}`)
				: undefined;
			const prior = sources.get(item.id);
			const childParts = childIds.get(item.id)?.map(partOf);
			const children = sameList(prior?.children, childParts)
				? prior?.children
				: childParts;
			let target: Part | undefined;
			let asker: ToolCall | undefined;
			if (item.kind === "approval_request") {
				const targetId = (item as ApprovalRequest).targetItemId;
				const targetItem = targetId ? items.get(targetId)?.item : undefined;
				target = targetItem ? partOf(targetItem) : undefined;
				const parent = item.parentItemId
					? items.get(item.parentItemId)?.item
					: undefined;
				asker = isSubagentCall(parent) ? parent : undefined;
			}
			building.delete(item.id);

			const unchanged =
				prior !== undefined &&
				prior.item === item &&
				prior.text === text &&
				prior.children === children &&
				prior.target === target &&
				prior.asker === asker;
			const plain =
				text === undefined &&
				children === undefined &&
				target === undefined &&
				asker === undefined;
			const part: Part = unchanged
				? prior.part
				: plain
					? item
					: {
							...item,
							...(text === undefined ? {} : { text }),
							...(children ? { children } : {}),
							...(target ? { approvalTarget: target } : {}),
							...(asker ? { approvalAsker: asker } : {}),
						};
			nextSources.set(item.id, { item, text, children, target, asker, part });
			return part;
		};

		const partsByTurn = new Map<string, Item[]>();
		const echoed = new Set<string>();
		for (const { item, turnId } of items.values()) {
			if (item.kind === "user_message") {
				const clientId = (item as UserMessage).clientId;
				if (clientId) echoed.add(clientId);
			}
			if (isSetAside(item)) continue;
			const nested =
				item.parentItemId !== undefined &&
				items.has(item.parentItemId) &&
				!isPendingApproval(item);
			if (nested) continue;
			const bucket = partsByTurn.get(turnId);
			if (bucket) bucket.push(item);
			else partsByTurn.set(turnId, [item]);
		}

		const nextTurnsById = new Map<string, ChatTurn>();
		const ordered: { turn: ChatTurn; startedAtMs: number }[] = [];
		for (const [turnId, turnItems] of partsByTurn) {
			turnItems.sort(byStartThenId);
			const parts = turnItems.map(partOf);
			const record = turns.get(turnId) ?? null;
			const prior = turnsById.get(turnId);
			const turn =
				prior && prior.turn === record && sameList(prior.parts, parts)
					? prior
					: { id: turnId, turn: record, sending: null, parts };
			nextTurnsById.set(turnId, turn);
			ordered.push({
				turn,
				startedAtMs:
					record?.startedAtMs ??
					turnItems[0]?.startedAtMs ??
					Number.MAX_SAFE_INTEGER,
			});
		}
		ordered.sort((a, b) =>
			a.startedAtMs !== b.startedAtMs
				? a.startedAtMs - b.startedAtMs
				: a.turn.id < b.turn.id
					? -1
					: a.turn.id > b.turn.id
						? 1
						: 0,
		);

		const next = ordered.map((entry) => entry.turn);
		const nextPending = new WeakMap<OutboxEntry, ChatTurn>();
		for (const entry of outbox) {
			if (echoed.has(entry.clientId)) continue;
			const turn = pendingByEntry.get(entry) ?? pendingTurn(entry);
			nextPending.set(entry, turn);
			next.push(turn);
		}

		sources = nextSources;
		turnsById = nextTurnsById;
		pendingByEntry = nextPending;
		lastInput = input;
		lastOutbox = outbox;
		lastTurns = sameList(lastTurns, next) ? lastTurns : next;
		return lastTurns;
	};
}
