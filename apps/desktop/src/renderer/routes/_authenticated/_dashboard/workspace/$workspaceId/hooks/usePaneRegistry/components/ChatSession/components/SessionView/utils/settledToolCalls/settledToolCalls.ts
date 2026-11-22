import type { TurnGroup } from "@superset/chat/core";
import type { ToolCall } from "@superset/chat/protocol";

/** How many of a turn's tool calls have finished, so far. */
export function settledToolCalls(group: TurnGroup | undefined): number {
	let settled = 0;
	for (const entry of group?.entries ?? []) {
		const tools =
			entry.kind === "tool_run"
				? entry.items
				: entry.item.kind === "tool_call"
					? [entry.item as ToolCall]
					: [];
		settled += tools.filter((tool) => tool.status !== "running").length;
	}
	return settled;
}
