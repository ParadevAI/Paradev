import { isSubagentCall } from "@superset/chat/core";
import type { Item, ToolCall } from "@superset/chat/protocol";

export function subagentLines(
	tool: ToolCall,
	children: readonly Item[] | undefined,
): readonly ToolCall[] | null {
	if (isSubagentCall(tool)) return [tool];
	if (!children || children.length === 0 || !children.every(isSubagentCall))
		return null;
	return children as readonly ToolCall[];
}

export function isNestedTool(
	tool: ToolCall,
	children: readonly Item[] | undefined,
): boolean {
	return isSubagentCall(tool) || (children?.length ?? 0) > 0;
}
