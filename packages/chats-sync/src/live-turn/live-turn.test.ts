import { describe, expect, test } from "bun:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import {
	applySessionUpdate,
	askedDevId,
	askTarget,
	type CompactionBlock,
	compactionText,
	EMPTY_STREAM,
	type ToolBlock,
	type TurnStream,
	toolDuration,
} from "./live-turn.ts";

const ASKED = "6f1c2a4e-1b2c-4d5e-8f90-123456789abc";
const prompt = (turnId?: string): SessionUpdate => ({
	sessionUpdate: "user_message_chunk",
	content: { type: "text", text: "New message…" },
	...(turnId ? { _meta: { "dev/turnId": turnId } } : {}),
});
const text = (t: string): SessionUpdate => ({
	sessionUpdate: "agent_message_chunk",
	content: { type: "text", text: t },
});
const thought = (t: string): SessionUpdate => ({
	sessionUpdate: "agent_thought_chunk",
	content: { type: "text", text: t },
});
const call = (id: string, command: string): SessionUpdate => ({
	sessionUpdate: "tool_call",
	toolCallId: id,
	title: `bash ${command}`,
	kind: "execute",
	status: "in_progress",
	rawInput: { command },
});
const result = (
	id: string,
	status: "completed" | "failed",
	out: string,
): SessionUpdate => ({
	sessionUpdate: "tool_call_update",
	toolCallId: id,
	status,
	content: [{ type: "content", content: { type: "text", text: out } }],
});

const run = (
	updates: SessionUpdate[],
	turnId = "turn-2",
	from: TurnStream = EMPTY_STREAM,
) => updates.reduce((stream, u) => applySessionUpdate(stream, turnId, u), from);

describe("a turn's stream", () => {
	test("merges streamed chunks into text and thinking blocks, in order", () => {
		const stream = run([
			prompt("turn-2"),
			thought("Let me "),
			thought("look."),
			text("Read"),
			text("ing."),
			call("c1", "ls"),
			text("Done."),
		]);
		expect(
			stream.blocks.map((b) =>
				b.kind === "tool" || b.kind === "compaction"
					? `${b.kind}:${b.id}`
					: `${b.kind}:${b.text}`,
			),
		).toEqual([
			"thought:Let me look.",
			"text:Reading.",
			"tool:c1",
			"text:Done.",
		]);
	});

	test("skips what a replay holds from earlier turns, and starts over at this turn's prompt", () => {
		const stream = run([
			prompt("turn-1"),
			text("old answer"),
			call("c0", "ls"),
			prompt("turn-2"),
			text("new"),
		]);
		expect(stream).toEqual({
			inTurn: true,
			blocks: [{ kind: "text", text: "new" }],
		});
		// An old runner sends no turn id: nothing can be attributed to this turn.
		expect(run([prompt(), text("unknown")]).blocks).toEqual([]);
		// A reconnect replays this turn again from its prompt: no duplicates.
		const once = run([prompt("turn-2"), text("hi"), call("c1", "ls")]);
		expect(
			run(
				[
					prompt("turn-1"),
					text("old"),
					prompt("turn-2"),
					text("hi"),
					call("c1", "ls"),
				],
				"turn-2",
				once,
			),
		).toEqual(once);
	});

	test("a tool call goes in progress → completed or failed, keeping its title, input and output", () => {
		const running = run([
			prompt("turn-2"),
			call("c1", "dev chat read --limit 5"),
		]);
		expect(running.blocks[0]).toEqual({
			kind: "tool",
			id: "c1",
			title: "bash dev chat read --limit 5",
			toolKind: "execute",
			status: "in_progress",
			input: { command: "dev chat read --limit 5" },
			output: "",
			ask: null,
		});
		const done = run([result("c1", "completed", "Posted.")], "turn-2", running);
		expect(done.blocks[0]).toMatchObject({
			status: "completed",
			output: "Posted.",
			title: "bash dev chat read --limit 5",
			input: { command: "dev chat read --limit 5" },
		});
		const failed = run(
			[call("c2", "false"), result("c2", "failed", "exit 1")],
			"turn-2",
			done,
		);
		expect(failed.blocks[1]).toMatchObject({
			id: "c2",
			status: "failed",
			output: "exit 1",
		});
	});

	test("a sketch's call is named from when the model starts writing it, through running and finishing", () => {
		const named = (
			status: "pending" | "in_progress",
			rawInput?: unknown,
		): SessionUpdate => ({
			sessionUpdate: "tool_call",
			toolCallId: "c1",
			title: rawInput ? "sketch Trip budget" : "sketch",
			kind: "other",
			status,
			...(rawInput ? { rawInput } : {}),
			_meta: { "dev/tool": "sketch" },
		});
		const writing = run([prompt("turn-2"), named("pending")])
			.blocks[0] as ToolBlock;
		expect(writing).toMatchObject({
			name: "sketch",
			status: "pending",
			title: "sketch",
		});
		const done = run([
			prompt("turn-2"),
			named("pending"),
			named("in_progress", { title: "Trip budget" }),
			result("c1", "completed", "Sketched"),
		]).blocks[0] as ToolBlock;
		expect(done).toMatchObject({
			name: "sketch",
			status: "completed",
			title: "sketch Trip budget",
		});
		expect(
			(run([prompt("turn-2"), call("t1", "ls")]).blocks[0] as ToolBlock).name,
		).toBeUndefined();
	});

	test("an update for a call it never saw still shows up", () => {
		expect(
			run([prompt("turn-2"), result("c9", "completed", "ok")]).blocks,
		).toEqual([
			{
				kind: "tool",
				id: "c9",
				title: "Tool",
				toolKind: "other",
				status: "completed",
				input: null,
				output: "ok",
				ask: null,
			},
		]);
	});

	test("a stored trace's tool calls keep when they started and ended", () => {
		const at = (u: SessionUpdate, ms: number) =>
			({ ...u, _meta: { "dev/at": ms } }) as SessionUpdate;
		const stream = run([
			prompt("turn-2"),
			at(call("c1", "ls"), 40),
			at(result("c1", "completed", "a"), 290),
			call("c2", "pwd"),
		]);
		expect(stream.blocks).toMatchObject([
			{ id: "c1", startedAt: 40, endedAt: 290 },
			{ id: "c2" },
		]);
		expect(stream.blocks[1]).not.toHaveProperty("startedAt");
		expect(toolDuration(stream.blocks[0] as ToolBlock)).toBe(250);
		expect(toolDuration(stream.blocks[1] as ToolBlock)).toBeNull();
	});

	test("pi's compactions and a session rollover show where they happened, updated in place", () => {
		const compaction = (
			status: string,
			meta?: Record<string, unknown>,
		): SessionUpdate =>
			({
				sessionUpdate: "compaction_update",
				compactionId: meta ? "rollover-2" : "compaction-1",
				status,
				...(meta ? { _meta: meta } : {}),
			}) as SessionUpdate;
		const rollover = {
			reason: "context",
			tokens: 96_000,
			contextWindow: 1_000_000,
			archived: "a.jsonl",
			handover: true,
		};
		const stream = run([
			prompt("turn-2"),
			compaction("in_progress"),
			text("Done."),
			compaction("completed"),
			compaction("completed", { "dev/rollover": rollover }),
		]);
		expect(stream.blocks).toEqual([
			{
				kind: "compaction",
				id: "compaction-1",
				status: "completed",
				rollover: null,
			},
			{ kind: "text", text: "Done." },
			{
				kind: "compaction",
				id: "rollover-2",
				status: "completed",
				rollover: {
					reason: "context",
					tokens: 96_000,
					contextWindow: 1_000_000,
					handover: true,
				},
			},
		]);
		expect(
			stream.blocks
				.filter((b) => b.kind === "compaction")
				.map((b) => compactionText(b as CompactionBlock)),
		).toEqual([
			{ title: "Context compacted", detail: null },
			{
				title: "New session started",
				detail:
					"The context was getting full (96k of 1M tokens). A handover note was written.",
			},
		]);
	});

	test("a `dev ask` call is marked with who it asks, by id or by name", () => {
		const stream = run([
			prompt("turn-2"),
			call("c1", `dev ask ${ASKED} "When are you free?"`),
			call("c2", `dev ask "Goa trip" "When?"`),
		]);
		expect(stream.blocks).toMatchObject([{ ask: ASKED }, { ask: "Goa trip" }]);
	});
});

describe("askTarget", () => {
	test("finds the id or name in a `dev ask` command, however it's written", () => {
		expect(askTarget({ command: `dev ask ${ASKED} "free?"` })).toBe(ASKED);
		expect(
			askTarget({ command: `cd /agent && dev  ask '${ASKED}' 'free?'` }),
		).toBe(ASKED);
		expect(askTarget({ command: `dev ask "Goa trip" "free?"` })).toBe(
			"Goa trip",
		);
		expect(askTarget({ command: `dev ask Juniper "free?"` })).toBe("Juniper");
		expect(askTarget({ command: `echo dev ask` })).toBeNull();
		expect(askTarget({ command: `notdev ask ${ASKED}` })).toBeNull();
		expect(askTarget({ path: "/agent" })).toBeNull();
		expect(askTarget(null)).toBeNull();
	});
});

describe("askedDevId", () => {
	const devs = [
		{ id: "a1", name: "Goa trip" },
		{ id: "b2", name: "Juniper" },
		{ id: "c3", name: "Juniper" },
		{ id: "d4", name: "Wren" },
	];

	test("an id as is; a name only one of the chat's Devs has, case-insensitively", () => {
		expect(askedDevId(ASKED.toUpperCase(), devs)).toBe(ASKED);
		expect(askedDevId("goa trip", devs)).toBe("a1");
		expect(askedDevId("Wren", devs)).toBe("d4");
	});

	test("an ambiguous or unknown name resolves to nobody, as the server refuses it", () => {
		expect(askedDevId("Juniper", devs)).toBeNull();
		expect(askedDevId("Pip", devs)).toBeNull();
	});
});

describe("subagents in a turn", () => {
	const runState = (
		id: string,
		status: string,
		extra: Record<string, unknown> = {},
	): SessionUpdate => ({
		sessionUpdate: "tool_call_update",
		toolCallId: "s1",
		_meta: {
			"dev/subagentRun": {
				id,
				agent: id === "s1-1" ? "planner" : "writer",
				task: `task ${id}`,
				status,
				usage: {
					steps: 1,
					input: 100,
					output: 20,
					cacheRead: 0,
					cacheWrite: 0,
					cost: 0.001,
				},
				model: "m",
				error: null,
				...extra,
			},
		},
	});
	const of = (run: string, update: SessionUpdate): SessionUpdate => ({
		...update,
		_meta: { ...update._meta, "dev/subagent": { parent: "s1", run } },
	});
	const start: SessionUpdate = {
		sessionUpdate: "tool_call",
		toolCallId: "s1",
		title: "subagents planner, writer",
		kind: "other",
		status: "in_progress",
		rawInput: {},
	};

	test("nest each run's text and tool calls under the call, apart from the turn's and from each other's", () => {
		const stream = run([
			prompt("turn-2"),
			text("Delegating."),
			start,
			runState("s1-1", "pending"),
			runState("s1-2", "pending"),
			runState("s1-1", "in_progress"),
			runState("s1-2", "in_progress"),
			of("s1-1", text("Day 1: ")),
			of("s1-2", call("s1-2/c1", "ls")),
			of("s1-1", text("Alfama.")),
			of("s1-2", result("s1-2/c1", "completed", "draft.md")),
			runState("s1-1", "completed"),
			runState("s1-2", "failed", { error: "Stopped after 25 steps" }),
			result("s1", "completed", "### planner (completed)…"),
		]);
		expect(stream.blocks).toHaveLength(2);
		const tool = stream.blocks[1] as ToolBlock;
		expect(tool).toMatchObject({
			id: "s1",
			status: "completed",
			output: "### planner (completed)…",
		});
		expect(tool.subagents).toMatchObject([
			{
				id: "s1-1",
				agent: "planner",
				task: "task s1-1",
				status: "completed",
				usage: { steps: 1, cost: 0.001 },
				blocks: [{ kind: "text", text: "Day 1: Alfama." }],
			},
			{
				id: "s1-2",
				agent: "writer",
				status: "failed",
				error: "Stopped after 25 steps",
				blocks: [
					{
						kind: "tool",
						id: "s1-2/c1",
						status: "completed",
						output: "draft.md",
					},
				],
			},
		]);
	});

	test("stamp a stored run with when it started and ended", () => {
		const at = (update: SessionUpdate, ms: number): SessionUpdate => ({
			...update,
			_meta: { ...update._meta, "dev/at": ms },
		});
		const stream = run([
			prompt("turn-2"),
			start,
			at(runState("s1-1", "pending"), 5),
			at(runState("s1-1", "in_progress"), 40),
			at(runState("s1-1", "completed"), 900),
		]);
		expect((stream.blocks[0] as ToolBlock).subagents![0]).toMatchObject({
			startedAt: 40,
			endedAt: 900,
		});
	});

	test("ignore a run's updates when its call isn't known, and run states it doesn't know", () => {
		expect(run([prompt("turn-2"), of("s1-1", text("lost"))]).blocks).toEqual(
			[],
		);
		const odd = run([prompt("turn-2"), start, runState("s1-1", "exploded")]);
		expect((odd.blocks[0] as ToolBlock).subagents![0]!.status).toBe("pending");
	});
});
