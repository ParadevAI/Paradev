import type { ToolCall } from "@superset/chat/protocol";

/** How claude-acp stores an execute call: the command in rawInput, the output as text. */
export function claudeTool(command: string, output: string): ToolCall {
	return {
		id: `tool:${command.length}:${output.length}`,
		kind: "tool_call",
		startedAtMs: 0,
		title: command,
		toolKind: "execute",
		status: "completed",
		rawInput: { command },
		content: [{ type: "text", text: output }],
	} as ToolCall;
}

/** A harness that stores terminal content with the command inside it. */
export function terminalTool(command: string, output: string): ToolCall {
	return {
		id: `terminal:${command.length}:${output.length}`,
		kind: "tool_call",
		startedAtMs: 0,
		title: "Shell",
		toolKind: "execute",
		status: "completed",
		content: [{ type: "terminal", command, output }],
	} as ToolCall;
}
