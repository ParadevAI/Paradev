import { isAbsolute, resolve } from "node:path";
import type {
	AssistantMessage,
	AssistantMessageEvent,
} from "@earendil-works/pi-ai";
import { type FileChange, fileDiff } from "../fileDiff";

export type AcpUpdate = { sessionUpdate: string } & Record<string, unknown>;

export type AcpStopReason = "end_turn" | "cancelled" | "error";

type ToolKind = "read" | "edit" | "execute" | "other";

/**
 * Turns the loop's pi events into ACP session updates, in the shape pdev's ACP
 * bridge sends to host-service today, so chat-runtime's mapping reads them unchanged.
 */
export class PiToAcp {
	private readonly startedToolCalls = new Set<string>();

	constructor(private readonly cwd: string) {}

	/** `clientId` is the sender's prompt id; the chat client confirms its send when the echo carries it. */
	userMessage(messageId: string, text: string, clientId?: string): AcpUpdate {
		return {
			sessionUpdate: "user_message",
			messageId,
			content: [{ type: "text", text }],
			...(clientId ? { clientId } : {}),
		};
	}

	assistantEvent(event: AssistantMessageEvent, messageId: string): AcpUpdate[] {
		switch (event.type) {
			case "text_delta":
				return [
					{
						sessionUpdate: "agent_message_chunk",
						messageId,
						content: { type: "text", text: event.delta },
					},
				];
			case "thinking_delta":
				return [
					{
						sessionUpdate: "agent_thought_chunk",
						messageId: thoughtMessageId(messageId),
						content: { type: "text", text: event.delta },
					},
				];
			case "toolcall_start": {
				const block = event.partial.content[event.contentIndex];
				if (block?.type !== "toolCall" || !block.id) return [];
				if (this.startedToolCalls.has(block.id)) return [];
				this.startedToolCalls.add(block.id);
				return [
					{
						sessionUpdate: "tool_call_update",
						toolCallId: block.id,
						name: block.name,
						title: block.name,
						kind: toolKind(block.name),
						status: "pending",
					},
				];
			}
			case "toolcall_end": {
				const { id, name, arguments: args } = event.toolCall;
				const known = this.startedToolCalls.has(id);
				this.startedToolCalls.add(id);
				return [
					{
						sessionUpdate: "tool_call_update",
						toolCallId: id,
						...(known ? {} : { name, kind: toolKind(name), status: "pending" }),
						title: toolTitle(name, args),
						...this.locations(args),
						rawInput: args,
					},
				];
			}
			default:
				return [];
		}
	}

	assistantEnd(message: AssistantMessage, messageId: string): AcpUpdate[] {
		const updates: AcpUpdate[] = [];
		const thinking = message.content
			.map((block) => (block.type === "thinking" ? block.thinking : ""))
			.join("");
		if (thinking) {
			updates.push({
				sessionUpdate: "agent_thought",
				messageId: thoughtMessageId(messageId),
				content: [{ type: "text", text: thinking }],
			});
		}
		const text = message.content
			.map((block) => (block.type === "text" ? block.text : ""))
			.join("");
		if (text) {
			const model = message.responseModel ?? message.model;
			updates.push({
				sessionUpdate: "agent_message",
				messageId,
				content: [{ type: "text", text }],
				...(model ? { _meta: { piAcp: { model } } } : {}),
			});
		}
		return updates;
	}

	toolStart(toolCallId: string, toolName: string, args: unknown): AcpUpdate {
		this.startedToolCalls.add(toolCallId);
		return {
			sessionUpdate: "tool_call_update",
			toolCallId,
			name: toolName,
			title: toolTitle(toolName, args),
			kind: toolKind(toolName),
			status: "in_progress",
			...this.locations(args),
			rawInput: args,
		};
	}

	toolUpdate(
		toolCallId: string,
		toolName: string,
		partial: unknown,
	): AcpUpdate {
		const text = toolText(toolName, partial);
		return {
			sessionUpdate: "tool_call_update",
			toolCallId,
			...(text ? { content: textContent(text) } : {}),
			rawOutput: partial,
		};
	}

	toolEnd(input: {
		toolCallId: string;
		toolName: string;
		result: unknown;
		isError: boolean;
		fileChange?: FileChange;
	}): AcpUpdate {
		this.startedToolCalls.delete(input.toolCallId);
		const status = input.isError ? "failed" : "completed";
		const change = input.fileChange;
		if (
			!input.isError &&
			change &&
			(change.oldText === null || change.oldText !== change.newText)
		) {
			return {
				sessionUpdate: "tool_call_update",
				toolCallId: input.toolCallId,
				status,
				content: [fileDiff(change)],
			};
		}
		const text = toolText(input.toolName, input.result);
		return {
			sessionUpdate: "tool_call_update",
			toolCallId: input.toolCallId,
			status,
			...(text ? { content: textContent(text) } : {}),
			rawOutput: input.result,
		};
	}

	/** Tool calls the model asked for that never finished; closed when a turn ends. */
	abandonOpenToolCalls(): AcpUpdate[] {
		const updates = [...this.startedToolCalls].map((toolCallId) => ({
			sessionUpdate: "tool_call_update",
			toolCallId,
			status: "failed",
		}));
		this.startedToolCalls.clear();
		return updates;
	}

	running(): AcpUpdate {
		return { sessionUpdate: "state_update", state: "running" };
	}

	idle(stopReason: AcpStopReason, errorMessage?: string): AcpUpdate {
		return {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason,
			...(stopReason === "error"
				? {
						error: { code: -32603, message: errorMessage ?? "The run failed." },
					}
				: {}),
		};
	}

	private locations(args: unknown): { locations?: Array<{ path: string }> } {
		const path = toolPath(args);
		if (!path) return {};
		return {
			locations: [{ path: isAbsolute(path) ? path : resolve(this.cwd, path) }],
		};
	}
}

function thoughtMessageId(messageId: string): string {
	return `${messageId}:thought`;
}

function toolKind(toolName: string): ToolKind {
	if (toolName === "read") return "read";
	if (toolName === "write" || toolName === "edit") return "edit";
	if (toolName === "bash") return "execute";
	return "other";
}

function toolPath(args: unknown): string | undefined {
	const record = args as { path?: unknown; file_path?: unknown } | null;
	if (typeof record?.path === "string") return record.path;
	if (typeof record?.file_path === "string") return record.file_path;
	return undefined;
}

function toolTitle(toolName: string, args: unknown): string {
	const record = args as {
		command?: unknown;
		description?: unknown;
		subagent_type?: unknown;
	} | null;
	if (toolName === "bash" && typeof record?.command === "string") {
		return record.command;
	}
	if (toolName === "read" || toolName === "write" || toolName === "edit") {
		return toolPath(args) ?? toolName;
	}
	if (toolName === "task" && typeof record?.description === "string") {
		return `Subagent: ${record.description}`;
	}
	return toolName;
}

function toolText(toolName: string, result: unknown): string {
	const record = result as {
		content?: unknown;
		details?: { diff?: unknown };
	} | null;
	if (toolName !== "bash" && typeof record?.details?.diff === "string") {
		return record.details.diff;
	}
	if (Array.isArray(record?.content)) {
		return record.content
			.map((block: { type?: string; text?: unknown }) =>
				block?.type === "text" && typeof block.text === "string"
					? block.text
					: "",
			)
			.join("");
	}
	return "";
}

function textContent(text: string) {
	return [{ type: "content", content: { type: "text", text } }];
}
