import { describe, expect, test } from "bun:test";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { toAcpUpdates } from "./event-map.ts";

const update = (assistantMessageEvent: unknown) =>
	({
		type: "message_update",
		message: {},
		assistantMessageEvent,
	}) as unknown as AgentSessionEvent;

describe("pi events → ACP updates", () => {
	test("text and thinking deltas become message and thought chunks", () => {
		expect(toAcpUpdates(update({ type: "text_delta", delta: "Hi" }))).toEqual([
			{
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "Hi" },
			},
		]);
		expect(
			toAcpUpdates(update({ type: "thinking_delta", delta: "hmm" })),
		).toEqual([
			{
				sessionUpdate: "agent_thought_chunk",
				content: { type: "text", text: "hmm" },
			},
		]);
		expect(
			toAcpUpdates(update({ type: "toolcall_delta", delta: "{" })),
		).toEqual([]);
	});

	test("a tool execution opens a tool call with a readable title and kind, and closes it with its output", () => {
		const start = {
			type: "tool_execution_start",
			toolCallId: "t1",
			toolName: "bash",
			args: { command: "dev chat read --limit 5" },
		} as AgentSessionEvent;
		expect(toAcpUpdates(start)).toEqual([
			{
				sessionUpdate: "tool_call",
				toolCallId: "t1",
				title: "bash dev chat read --limit 5",
				kind: "execute",
				status: "in_progress",
				rawInput: { command: "dev chat read --limit 5" },
				_meta: { "dev/tool": "bash" },
			},
		]);
		const result = { content: [{ type: "text", text: "sent" }] };
		const end = {
			type: "tool_execution_end",
			toolCallId: "t1",
			toolName: "bash",
			result,
			isError: false,
		} as AgentSessionEvent;
		expect(toAcpUpdates(end)).toEqual([
			{
				sessionUpdate: "tool_call_update",
				toolCallId: "t1",
				status: "completed",
				content: [{ type: "content", content: { type: "text", text: "sent" } }],
				rawOutput: result,
			},
		]);
		expect(
			toAcpUpdates({ ...end, isError: true } as AgentSessionEvent)[0],
		).toMatchObject({ status: "failed" });
	});

	test("MCP tools are titled by server and tool; long titles are cut to one line", () => {
		const mcp = toAcpUpdates({
			type: "tool_execution_start",
			toolCallId: "t2",
			toolName: "mcp__flights__search",
			args: {},
		} as AgentSessionEvent);
		expect(mcp[0]).toMatchObject({ title: "flights: search", kind: "other" });
		const long = toAcpUpdates({
			type: "tool_execution_start",
			toolCallId: "t3",
			toolName: "read",
			args: { path: "x".repeat(300) },
		} as AgentSessionEvent);
		expect((long[0] as { title: string }).title).toHaveLength(120);
	});

	test("a subagent call is titled by the helpers it starts", () => {
		const title = (args: unknown) =>
			(
				toAcpUpdates({
					type: "tool_execution_start",
					toolCallId: "s",
					toolName: "subagent",
					args,
				} as AgentSessionEvent)[0] as { title: string }
			).title;
		expect(title({ agent: "planner", task: "x" })).toBe("subagent planner");
		expect(
			title({
				tasks: [
					{ agent: "researcher", task: "a" },
					{ agent: "researcher", task: "b" },
				],
			}),
		).toBe("subagents researcher, researcher");
		expect(
			title({
				chain: [
					{ agent: "planner", task: "a" },
					{ agent: "writer", task: "{previous}" },
				],
			}),
		).toBe("subagents planner → writer");
	});

	test("a sketch's call opens as the model starts writing it, so the chat can show it being drawn", () => {
		const partial = (name: string) => ({
			content: [
				{ type: "text", text: "Here:" },
				{ type: "toolCall", id: "c1", name, arguments: {} },
			],
		});
		expect(
			toAcpUpdates(
				update({
					type: "toolcall_start",
					contentIndex: 1,
					partial: partial("sketch"),
				}),
			),
		).toEqual([
			{
				sessionUpdate: "tool_call",
				toolCallId: "c1",
				title: "sketch",
				kind: "other",
				status: "pending",
				_meta: { "dev/tool": "sketch" },
			},
		]);
		expect(
			toAcpUpdates(
				update({
					type: "toolcall_start",
					contentIndex: 1,
					partial: partial("bash"),
				}),
			),
		).toEqual([]);
		const start = toAcpUpdates({
			type: "tool_execution_start",
			toolCallId: "c1",
			toolName: "sketch",
			args: { title: "Trip budget", html: "<p>" },
		} as AgentSessionEvent);
		expect(start[0]).toMatchObject({
			toolCallId: "c1",
			title: "sketch Trip budget",
			status: "in_progress",
			_meta: { "dev/tool": "sketch" },
		});
	});

	test("lifecycle events have no ACP counterpart", () => {
		expect(toAcpUpdates({ type: "agent_start" } as AgentSessionEvent)).toEqual(
			[],
		);
		expect(toAcpUpdates({ type: "agent_settled", aborted: false })).toEqual([]);
	});
});
