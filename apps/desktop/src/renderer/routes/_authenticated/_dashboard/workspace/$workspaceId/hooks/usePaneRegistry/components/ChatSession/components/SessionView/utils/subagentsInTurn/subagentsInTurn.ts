import type { TurnGroup } from "@superset/chat/core";
import type { ToolCall } from "@superset/chat/protocol";

export function subagentsInTurn(group: TurnGroup | undefined): Set<string> {
	const ids = new Set<string>();
	for (const entry of group?.entries ?? []) {
		const tools =
			entry.kind === "tool_run"
				? entry.items
				: entry.item.kind === "tool_call"
					? [entry.item as ToolCall]
					: [];
		for (const tool of tools) if (tool.subagent === true) ids.add(tool.id);
	}
	return ids;
}
