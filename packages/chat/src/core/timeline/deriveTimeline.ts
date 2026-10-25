import type { Turn } from "../../protocol/envelope";
import type {
	ApprovalRequest,
	Item,
	ToolCall,
	UserMessage,
} from "../../protocol/items";
import type { SessionSnapshot, StoredItem } from "../reducer/reducer";

export type TimelineEntry =
	| { kind: "item"; item: Item }
	| { kind: "tool_run"; items: ToolCall[] };

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

export function collapseWorkLog(items: readonly Item[]): TimelineEntry[] {
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
		flush();
		entries.push({ kind: "item", item });
	}
	flush();
	return entries;
}

export type DeriveTimelineOptions = {
	nestChildItems?: boolean;
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
			entries: collapseWorkLog(items),
		});
	}

	groups.sort((a, b) => {
		const aStart = a.turn?.startedAtMs ?? firstItemStart(a);
		const bStart = b.turn?.startedAtMs ?? firstItemStart(b);
		if (aStart !== bStart) return aStart - bStart;
		return a.turnId < b.turnId ? -1 : a.turnId > b.turnId ? 1 : 0;
	});
	return groups;
}

function firstItemStart(group: TurnGroup): number {
	const first = group.entries[0];
	if (!first) return Number.MAX_SAFE_INTEGER;
	return first.kind === "item"
		? first.item.startedAtMs
		: (first.items[0]?.startedAtMs ?? Number.MAX_SAFE_INTEGER);
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

function isPendingApproval(item: Item): boolean {
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
