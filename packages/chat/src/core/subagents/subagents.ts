import { type Item, isKnownItem, type ToolCall } from "../../protocol/items";
import type { SessionSnapshot } from "../reducer/reducer";

export function isSubagentCall(item: Item | undefined): item is ToolCall {
	return (
		item !== undefined &&
		isKnownItem(item) &&
		item.kind === "tool_call" &&
		item.subagent === true
	);
}

export function subagentItem(
	items: SessionSnapshot["items"],
	itemId: string | null | undefined,
): ToolCall | undefined {
	const item = itemId ? items.get(itemId)?.item : undefined;
	return isSubagentCall(item) ? item : undefined;
}

export function approvalAsker(
	items: SessionSnapshot["items"],
	item: Item,
): ToolCall | undefined {
	return isKnownItem(item) && item.kind === "approval_request"
		? subagentItem(items, item.parentItemId)
		: undefined;
}

export function* subagentAncestors(
	items: SessionSnapshot["items"],
	itemId: string | undefined,
): Generator<ToolCall> {
	const seen = new Set<string>();
	for (
		let id = itemId;
		id !== undefined && !seen.has(id);
		id = items.get(id)?.item.parentItemId
	) {
		seen.add(id);
		const item = subagentItem(items, id);
		if (item) yield item;
	}
}

export function subagentOutcome(
	item: ToolCall,
): "running" | "failed" | "stopped" | "finished" {
	const state = item.subagentStatus ?? item.status;
	if (state === "running" || state === "failed") return state;
	return state === "stopped" || state === "canceled" || state === "declined"
		? "stopped"
		: "finished";
}
