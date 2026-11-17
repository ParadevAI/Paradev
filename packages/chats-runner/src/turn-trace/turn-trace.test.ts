import { describe, expect, test } from "bun:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import {
	TRACE_BYTES_MAX,
	TRACE_TEXT_MAX,
	TraceRecorder,
} from "./turn-trace.ts";

function recorder(secrets: string[] = []) {
	let now = 1_000;
	const rec = new TraceRecorder({ secrets, now: () => now });
	return { rec, advance: (ms: number) => (now += ms) };
}

const text = (t: string): SessionUpdate => ({
	sessionUpdate: "agent_message_chunk",
	content: { type: "text", text: t },
});

describe("turn traces", () => {
	test("merge streamed text, leave the prompt out, and stamp tool calls with when they started and ended", () => {
		const { rec, advance } = recorder();
		rec.add({
			sessionUpdate: "user_message_chunk",
			content: { type: "text", text: "the whole prompt" },
		});
		rec.add(text("Hel"));
		rec.add(text("lo"));
		advance(50);
		rec.add({
			sessionUpdate: "tool_call",
			toolCallId: "t1",
			title: "bash ls",
			kind: "execute",
			status: "in_progress",
			rawInput: { command: "ls" },
		});
		advance(200);
		rec.add({
			sessionUpdate: "tool_call_update",
			toolCallId: "t1",
			status: "completed",
			content: [{ type: "content", content: { type: "text", text: "a\nb" } }],
			rawOutput: { big: true },
		});
		expect(rec.finish("m")).toEqual({
			model: "m",
			updates: [
				text("Hello"),
				{
					sessionUpdate: "tool_call",
					toolCallId: "t1",
					title: "bash ls",
					kind: "execute",
					status: "in_progress",
					rawInput: { command: "ls" },
					_meta: { "dev/at": 50 },
				},
				{
					sessionUpdate: "tool_call_update",
					toolCallId: "t1",
					status: "completed",
					content: [
						{ type: "content", content: { type: "text", text: "a\nb" } },
					],
					_meta: { "dev/at": 250 },
				},
			],
		});
	});

	test("keep subagent runs' text apart from the turn's and from each other's, their run state stamped like tool calls", () => {
		const { rec, advance } = recorder();
		const of = (run: string, t: string): SessionUpdate => ({
			...text(t),
			_meta: { "dev/subagent": { parent: "s1", run } },
		});
		rec.add(text("Delegating."));
		rec.add(of("s1-1", "Plan: "));
		rec.add(of("s1-1", "day 1"));
		rec.add(of("s1-2", "Draft"));
		rec.add(text(" Done."));
		advance(30);
		const run = { id: "s1-1", agent: "planner", status: "completed" };
		rec.add({
			sessionUpdate: "tool_call_update",
			toolCallId: "s1",
			_meta: { "dev/subagentRun": run },
		});
		expect(rec.finish("m").updates).toEqual([
			text("Delegating."),
			of("s1-1", "Plan: day 1"),
			of("s1-2", "Draft"),
			text(" Done."),
			{
				sessionUpdate: "tool_call_update",
				toolCallId: "s1",
				_meta: { "dev/subagentRun": run, "dev/at": 30 },
			},
		]);
	});

	test("cut long tool output and redact secrets anywhere in it", () => {
		const { rec } = recorder(["hunter22"]);
		rec.add({
			sessionUpdate: "tool_call",
			toolCallId: "t1",
			title: "bash env",
			status: "in_progress",
			rawInput: { command: "echo hunter22" },
		});
		rec.add({
			sessionUpdate: "tool_call_update",
			toolCallId: "t1",
			status: "completed",
			content: [
				{
					type: "content",
					content: {
						type: "text",
						text: `MCP_X=hunter22\n${"x".repeat(TRACE_TEXT_MAX * 2)}`,
					},
				},
			],
		});
		const json = JSON.stringify(rec.finish("m"));
		expect(json).not.toContain("hunter22");
		expect(json).toContain("more characters");
		expect(json.length).toBeLessThan(TRACE_TEXT_MAX * 2);
	});

	test("stop recording once the trace would pass its size cap", () => {
		const { rec } = recorder();
		for (let i = 0; i < 200; i++) {
			rec.add({
				sessionUpdate: "tool_call",
				toolCallId: `t${i}`,
				title: "read",
				status: "completed",
				rawInput: { path: "y".repeat(TRACE_TEXT_MAX) },
			});
		}
		const trace = rec.finish("m");
		expect(trace.truncated).toBe(true);
		expect(JSON.stringify(trace).length).toBeLessThan(TRACE_BYTES_MAX + 1_000);
	});
});
