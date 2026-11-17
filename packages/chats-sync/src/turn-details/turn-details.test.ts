import { describe, expect, test } from "bun:test";
import type {
	ApiMessageDetails,
	ApiTurnDetails,
} from "../api-types/api-types.ts";
import type { SubagentRun, ToolBlock } from "../live-turn/live-turn.ts";
import { nestedTurn } from "../live-turns/live-turns.ts";
import { apiMessage } from "../test-fixtures/test-fixtures.ts";
import {
	formatDuration,
	runMetaText,
	subagentsLabel,
	totalUsage,
	tracedTurn,
	turnDuration,
	usageText,
} from "./turn-details.ts";

const ASKED = "6f1c2a4e-1b2c-4d5e-8f90-123456789abc";

function turn(overrides: Partial<ApiTurnDetails> = {}): ApiTurnDetails {
	return {
		id: "t1",
		devId: "jun",
		groupId: "g1",
		parentTurnId: null,
		status: "ended",
		error: null,
		createdAt: "2026-10-13T10:00:00.000Z",
		startedAt: "2026-10-13T10:00:01.000Z",
		settledAt: "2026-10-13T10:00:05.200Z",
		endedAt: "2026-10-13T10:00:05.400Z",
		trace: null,
		...overrides,
	};
}

describe("tracedTurn", () => {
	test("replays a stored trace into the blocks the live view renders, its asks findable as nested turns", () => {
		const details: ApiMessageDetails = {
			message: apiMessage({
				groupId: "g1",
				authorId: null,
				authorDevId: "jun",
			}),
			turn: turn({
				trace: {
					model: "anthropic/claude-sonnet-5.5",
					updates: [
						{
							sessionUpdate: "agent_thought_chunk",
							content: { type: "text", text: "Ask Pip." },
						},
						{
							sessionUpdate: "tool_call",
							toolCallId: "c1",
							title: "bash",
							kind: "execute",
							status: "in_progress",
							rawInput: { command: `dev ask ${ASKED} "free?"` },
							_meta: { "dev/at": 10 },
						},
						{
							sessionUpdate: "tool_call_update",
							toolCallId: "c1",
							status: "completed",
							content: [
								{ type: "content", content: { type: "text", text: "Friday" } },
							],
							_meta: { "dev/at": 900 },
						},
					],
				},
			}),
			asks: [
				turn({
					id: "t2",
					devId: ASKED,
					parentTurnId: "t1",
					trace: {
						model: "m",
						updates: [
							{
								sessionUpdate: "agent_message_chunk",
								content: { type: "text", text: "Friday works." },
							},
						],
					},
				}),
				turn({ id: "t3", devId: "wren", parentTurnId: "t1" }),
			],
		};
		const traced = tracedTurn(details)!;
		expect(traced.turn.stream.blocks).toMatchObject([
			{ kind: "thought", text: "Ask Pip." },
			{
				kind: "tool",
				ask: ASKED,
				status: "completed",
				output: "Friday",
				startedAt: 10,
				endedAt: 900,
			},
		]);
		expect(nestedTurn(traced.asks, traced.turn, ASKED)?.stream.blocks).toEqual([
			{ kind: "text", text: "Friday works." },
		]);
		// An ask whose box never reported a trace has nothing to show.
		expect(traced.asks.finished.map((t) => t.turnId)).toEqual(["t2"]);
	});

	test("replays a trace's subagent runs nested under their call, each with what it did and used", () => {
		const usage = {
			steps: 2,
			input: 1200,
			output: 300,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0.006,
		};
		const state = (status: string, at: number) => ({
			sessionUpdate: "tool_call_update" as const,
			toolCallId: "s1",
			_meta: {
				"dev/subagentRun": {
					id: "s1-1",
					agent: "planner",
					task: "Plan Lisbon",
					status,
					usage,
					model: "m",
					error: null,
					step: 1,
				},
				"dev/at": at,
			},
		});
		const details: ApiMessageDetails = {
			message: apiMessage({
				groupId: "g1",
				authorId: null,
				authorDevId: "jun",
			}),
			turn: turn({
				trace: {
					model: "m",
					updates: [
						{
							sessionUpdate: "tool_call",
							toolCallId: "s1",
							title: "subagents planner → writer",
							kind: "other",
							status: "in_progress",
							rawInput: {},
							_meta: { "dev/at": 10 },
						},
						state("pending", 11),
						state("in_progress", 12),
						{
							sessionUpdate: "agent_message_chunk",
							content: { type: "text", text: "Day 1: Alfama" },
							_meta: { "dev/subagent": { parent: "s1", run: "s1-1" } },
						},
						state("completed", 3_000),
						{
							sessionUpdate: "tool_call_update",
							toolCallId: "s1",
							status: "completed",
							content: [
								{
									type: "content",
									content: { type: "text", text: "Day 1: Alfama" },
								},
							],
							_meta: { "dev/at": 3_010 },
						},
					],
				},
			}),
			asks: [],
		};
		const [tool] = tracedTurn(details)!.turn.stream.blocks;
		expect(tool).toMatchObject({
			kind: "tool",
			title: "subagents planner → writer",
			status: "completed",
			subagents: [
				{
					agent: "planner",
					task: "Plan Lisbon",
					status: "completed",
					step: 1,
					usage,
					startedAt: 12,
					endedAt: 3_000,
					blocks: [{ kind: "text", text: "Day 1: Alfama" }],
				},
			],
		});
	});

	test("a message without a turn, or whose box never reported one, has no trace", () => {
		expect(
			tracedTurn({ message: apiMessage(), turn: null, asks: [] }),
		).toBeNull();
		expect(
			tracedTurn({ message: apiMessage(), turn: turn(), asks: [] }),
		).toBeNull();
	});
});

describe("durations", () => {
	test("a turn runs from its start to the box's report", () => {
		expect(turnDuration(turn())).toBe(4200);
		expect(turnDuration(turn({ startedAt: null }))).toBeNull();
	});

	test("subagents' usage adds up and reads as steps, tokens and cost", () => {
		const run = (usage: SubagentRun["usage"]): SubagentRun => ({
			id: "r",
			agent: "planner",
			task: "",
			status: "completed",
			usage,
			model: null,
			error: null,
			step: null,
			blocks: [],
		});
		const a = {
			steps: 2,
			input: 9_000,
			output: 1_200,
			cacheRead: 2_000,
			cacheWrite: 200,
			cost: 0.004,
		};
		const b = {
			steps: 1,
			input: 500,
			output: 100,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0.03,
		};
		expect(totalUsage([run(a), run(null), run(b)])).toEqual({
			steps: 3,
			input: 9_500,
			output: 1_300,
			cacheRead: 2_000,
			cacheWrite: 200,
			cost: 0.034,
		});
		expect(totalUsage([run(null)])).toBeNull();
		expect(usageText(a)).toBe("2 steps · 12.4k tokens · $0.0040");
		expect(usageText(b)).toBe("1 step · 600 tokens · $0.03");
		expect(usageText({ ...b, cost: 0 })).toBe("1 step · 600 tokens");
		expect(runMetaText({ ...run(b), startedAt: 1_000, endedAt: 5_200 })).toBe(
			"1 step · 600 tokens · $0.03 · 4.2 s",
		);
		expect(runMetaText({ ...run({ ...b, steps: 0 }), startedAt: 1_000 })).toBe(
			"",
		);
	});

	test("a subagent call reads as how many ran and how", () => {
		const tool = (input: unknown, runs: number): ToolBlock => ({
			kind: "tool",
			id: "s1",
			title: "subagents",
			toolKind: "other",
			status: "completed",
			input,
			output: "",
			ask: null,
			subagents: Array.from({ length: runs }, (_, i) => ({
				id: `r${i}`,
				agent: "planner",
				task: "",
				status: "completed",
				usage: null,
				model: null,
				error: null,
				step: null,
				blocks: [],
			})),
		});
		expect(subagentsLabel(tool({ agent: "planner", task: "x" }, 1))).toBe(
			"Subagent",
		);
		expect(subagentsLabel(tool({ tasks: [] }, 3))).toBe(
			"3 subagents in parallel",
		);
		expect(subagentsLabel(tool({ chain: [] }, 2))).toBe(
			"2 subagents in a chain",
		);
	});

	test("read as ms, seconds or minutes", () => {
		expect(formatDuration(850)).toBe("850 ms");
		expect(formatDuration(4200)).toBe("4.2 s");
		expect(formatDuration(42_000)).toBe("42 s");
		expect(formatDuration(125_000)).toBe("2 min 5 s");
	});
});
