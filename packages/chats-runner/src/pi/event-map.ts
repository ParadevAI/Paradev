import type { SessionUpdate, ToolKind } from "@agentclientprotocol/sdk";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

const KINDS: Record<string, ToolKind> = {
	bash: "execute",
	read: "read",
	write: "edit",
	edit: "edit",
	ls: "search",
	grep: "search",
	find: "search",
};

/** `_meta` key on a tool call: the tool's name, so a client can draw one tool its own way (a sketch being drawn). */
const TOOL_META = "dev/tool";

/**
 * Tools whose call opens as soon as the model starts writing it, not when it runs: a sketch's arguments are a whole
 * page, written over many seconds, and the chat shows it being drawn meanwhile.
 */
const OPEN_EARLY = new Set(["sketch"]);

/** Long enough to recognise a command in a collapsed tool row, short enough to keep the row one line. */
const TITLE_MAX = 120;

/** "subagent planner", "subagents researcher, researcher", "subagents planner → writer". */
function subagentTitle(args: Record<string, unknown> | undefined): string {
	const names = (list: unknown) =>
		Array.isArray(list)
			? list.map((t: { agent?: unknown }) => String(t?.agent ?? "?"))
			: [];
	const chain = names(args?.chain);
	if (chain.length) return `subagents ${chain.join(" → ")}`;
	const tasks = names(args?.tasks);
	if (tasks.length) return `subagents ${tasks.join(", ")}`;
	return `subagent ${String(args?.agent ?? "")}`.trim();
}

function toolTitle(
	name: string,
	args: Record<string, unknown> | undefined,
): string {
	const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
	if (mcp) return `${mcp[1]}: ${mcp[2]}`;
	if (name === "subagent") return subagentTitle(args);
	const subject =
		args?.command ??
		args?.path ??
		args?.pattern ??
		(name === "sketch" ? args?.title : undefined);
	const title = typeof subject === "string" ? `${name} ${subject}` : name;
	return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

function resultText(result: unknown): string {
	const content =
		(result as { content?: { type: string; text?: string }[] } | undefined)
			?.content ?? [];
	return content
		.filter((c) => c.type === "text" && c.text)
		.map((c) => c.text)
		.join("\n");
}

/**
 * Translates one pi session event into the ACP updates watchers render: streamed text and thinking, and a tool call
 * that opens when execution starts (a sketch's as the model starts writing it) and closes with its output. Compactions
 * are the hub's to number (it reports them with rollovers); everything else pi reports (turn boundaries, queue
 * bookkeeping) has no ACP counterpart and maps to nothing.
 */
export function toAcpUpdates(event: AgentSessionEvent): SessionUpdate[] {
	switch (event.type) {
		case "message_update": {
			const e = event.assistantMessageEvent;
			if (e.type === "text_delta")
				return [
					{
						sessionUpdate: "agent_message_chunk",
						content: { type: "text", text: e.delta },
					},
				];
			if (e.type === "thinking_delta")
				return [
					{
						sessionUpdate: "agent_thought_chunk",
						content: { type: "text", text: e.delta },
					},
				];
			if (e.type === "toolcall_start") {
				const call = e.partial.content[e.contentIndex];
				if (call?.type !== "toolCall" || !OPEN_EARLY.has(call.name)) return [];
				return [
					{
						sessionUpdate: "tool_call",
						toolCallId: call.id,
						title: call.name,
						kind: "other",
						status: "pending",
						_meta: { [TOOL_META]: call.name },
					},
				];
			}
			return [];
		}
		case "tool_execution_start":
			return [
				{
					sessionUpdate: "tool_call",
					toolCallId: event.toolCallId,
					title: toolTitle(event.toolName, event.args),
					kind: KINDS[event.toolName] ?? "other",
					status: "in_progress",
					rawInput: event.args,
					_meta: { [TOOL_META]: event.toolName },
				},
			];
		case "tool_execution_end": {
			const text = resultText(event.result);
			return [
				{
					sessionUpdate: "tool_call_update",
					toolCallId: event.toolCallId,
					status: event.isError ? "failed" : "completed",
					...(text
						? {
								content: [{ type: "content", content: { type: "text", text } }],
							}
						: {}),
					rawOutput: event.result,
				},
			];
		}
		default:
			return [];
	}
}
