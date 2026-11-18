import type { Turn } from "../../protocol/envelope";
import type {
	ApprovalRequest,
	Item,
	ToolCall,
	UserMessage,
} from "../../protocol/items";
import { claudeBookkeeping } from "../bookkeeping/claude";
import type { SessionSnapshot, StoredItem } from "../reducer/reducer";
import { type UserStop, userStopOf, userStopReply } from "../userStop/userStop";

export type TimelineEntry =
	| { kind: "item"; item: Item }
	| { kind: "tool_run"; items: ToolCall[] }
	| { kind: "user_stop"; item: UserMessage; stop: UserStop };

export type TurnGroup = {
	turn: Turn | null;
	turnId: string;
	entries: TimelineEntry[];
};

function byStartThenId(a: Item, b: Item): number {
	if (a.startedAtMs !== b.startedAtMs) return a.startedAtMs - b.startedAtMs;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isToolCall(item: Item): item is ToolCall {
	return item.kind === "tool_call";
}

/** The agent reports a command it was stopped in as failed. */
function stoppedCall(call: ToolCall): ToolCall {
	return call.status === "failed" ? { ...call, status: "canceled" } : call;
}

/** A replay opens a turn at the stop note, so the calls it stopped end the turn before. */
function stopTrailingCalls(entries: TimelineEntry[]): void {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry?.kind === "tool_run") {
			entries[index] = {
				kind: "tool_run",
				items: entry.items.map(stoppedCall),
			};
		} else if (entry?.kind === "item" && isToolCall(entry.item)) {
			entries[index] = { kind: "item", item: stoppedCall(entry.item) };
		} else {
			return;
		}
	}
}

function isStopReply(item: Item, harness: string | undefined): boolean {
	return (
		harness !== undefined &&
		claudeBookkeeping.harnesses.includes(harness) &&
		item.kind === "agent_message" &&
		userStopReply((item as { text?: string }).text ?? "")
	);
}

export function collapseWorkLog(
	items: readonly Item[],
	harness?: string,
): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	let run: ToolCall[] = [];

	const flush = () => {
		if (run.length === 0) return;
		if (run.length === 1)
			entries.push({ kind: "item", item: run[0] as ToolCall });
		else entries.push({ kind: "tool_run", items: run });
		run = [];
	};

	for (const item of items) {
		if (isToolCall(item)) {
			run.push(item);
			continue;
		}
		const stop = userStopOf(item, harness);
		if (stop) run = run.map(stoppedCall);
		flush();
		if (isStopReply(item, harness)) continue;
		entries.push(
			stop
				? { kind: "user_stop", item: item as UserMessage, stop }
				: { kind: "item", item },
		);
	}
	flush();
	return entries;
}

export type DeriveTimelineOptions = {
	nestChildItems?: boolean;
	/** `SessionState.harness`. A stop marker counts only in the harness that writes it. */
	harness?: string;
};

export function deriveTimeline(
	snapshot: Pick<SessionSnapshot, "items" | "turns">,
	options?: DeriveTimelineOptions,
): TurnGroup[] {
	const itemsByTurn = new Map<string, Item[]>();
	for (const stored of snapshot.items.values() as Iterable<StoredItem>) {
		if (isQueuedPrompt(stored.item) || isDiscardedPrompt(stored.item)) continue;
		if (
			options?.nestChildItems &&
			stored.item.parentItemId &&
			snapshot.items.has(stored.item.parentItemId) &&
			!isPendingApproval(stored.item)
		)
			continue;
		const bucket = itemsByTurn.get(stored.turnId);
		if (bucket) bucket.push(stored.item);
		else itemsByTurn.set(stored.turnId, [stored.item]);
	}

	const groups: TurnGroup[] = [];
	for (const [turnId, items] of itemsByTurn) {
		items.sort(byStartThenId);
		groups.push({
			turn: snapshot.turns.get(turnId) ?? null,
			turnId,
			entries: collapseWorkLog(items, options?.harness),
		});
	}

	groups.sort((a, b) => {
		const aStart = a.turn?.startedAtMs ?? firstItemStart(a);
		const bStart = b.turn?.startedAtMs ?? firstItemStart(b);
		if (aStart !== bStart) return aStart - bStart;
		return a.turnId < b.turnId ? -1 : a.turnId > b.turnId ? 1 : 0;
	});
	for (const [index, group] of groups.entries()) {
		if (groups[index + 1]?.entries[0]?.kind === "user_stop") {
			stopTrailingCalls(group.entries);
		}
	}
	return groups;
}

function firstItemStart(group: TurnGroup): number {
	const first = group.entries[0];
	if (!first) return Number.MAX_SAFE_INTEGER;
	return first.kind === "tool_run"
		? (first.items[0]?.startedAtMs ?? Number.MAX_SAFE_INTEGER)
		: first.item.startedAtMs;
}

export function deriveChildrenByParent(
	snapshot: Pick<SessionSnapshot, "items">,
	previous?: ReadonlyMap<string, readonly Item[]>,
): ReadonlyMap<string, readonly Item[]> {
	const grouped = new Map<string, Item[]>();
	for (const stored of snapshot.items.values() as Iterable<StoredItem>) {
		const parentItemId = stored.item.parentItemId;
		if (!parentItemId || !snapshot.items.has(parentItemId)) continue;
		if (isQueuedPrompt(stored.item) || isDiscardedPrompt(stored.item)) continue;
		const bucket = grouped.get(parentItemId);
		if (bucket) bucket.push(stored.item);
		else grouped.set(parentItemId, [stored.item]);
	}
	const result = new Map<string, readonly Item[]>();
	for (const [parentItemId, children] of grouped) {
		children.sort(byStartThenId);
		const prior = previous?.get(parentItemId);
		result.set(
			parentItemId,
			prior &&
				prior.length === children.length &&
				prior.every((item, index) => item === children[index])
				? prior
				: children,
		);
	}
	return result;
}

export function derivePendingApprovals(
	snapshot: Pick<SessionSnapshot, "items">,
): ApprovalRequest[] {
	const pending: ApprovalRequest[] = [];
	for (const { item } of snapshot.items.values())
		if (isPendingApproval(item)) pending.push(item as ApprovalRequest);
	pending.sort(byStartThenId);
	return pending;
}

export function isPendingApproval(item: Item): boolean {
	return (
		item.kind === "approval_request" &&
		(item as ApprovalRequest).status === "pending"
	);
}

function isQueuedPrompt(item: Item): item is UserMessage {
	return item.kind === "user_message" && (item as UserMessage).queued === true;
}

function isDiscardedPrompt(item: Item): boolean {
	return (
		item.kind === "user_message" && (item as UserMessage).discarded === true
	);
}

export function deriveQueuedPrompts(
	snapshot: Pick<SessionSnapshot, "items">,
): UserMessage[] {
	const queued: UserMessage[] = [];
	for (const stored of snapshot.items.values()) {
		if (isQueuedPrompt(stored.item)) queued.push(stored.item);
	}
	return queued;
}
