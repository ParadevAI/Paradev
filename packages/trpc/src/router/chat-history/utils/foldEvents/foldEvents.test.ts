import { describe, expect, test } from "bun:test";
import type { DurableEvent } from "@superset/chat/protocol";
import { foldEvents } from "./foldEvents";

const tool = (status: string): DurableEvent =>
	({
		type: "item",
		turnId: "t1",
		item: {
			id: "tool",
			kind: "tool_call",
			title: "Run tests",
			toolKind: "execute",
			toolName: "bash",
			status,
			content: [],
			startedAtMs: 5,
		},
	}) as DurableEvent;

describe("foldEvents", () => {
	test("keeps the newest version and the first seq, in any arrival order", () => {
		const folded = foldEvents([
			{ seq: 7, ts: 0, event: tool("completed") },
			{ seq: 3, ts: 0, event: tool("running") },
		]);
		expect(folded.items).toHaveLength(1);
		expect(folded.items[0]).toMatchObject({ seq: 7, firstSeq: 3 });
		expect(folded.items[0]?.body).toMatchObject({ status: "completed" });
		expect(folded.lastSeq).toBe(7);
	});

	test("keeps the newest version of each turn and its first seq", () => {
		const turn = (status: string): DurableEvent =>
			({
				type: "turn",
				turn: { id: "t1", status, startedAtMs: 5 },
			}) as DurableEvent;
		const folded = foldEvents([
			{ seq: 9, ts: 0, event: turn("completed") },
			{ seq: 2, ts: 0, event: turn("running") },
		]);
		expect(folded.turns).toHaveLength(1);
		expect(folded.turns[0]).toMatchObject({
			seq: 9,
			firstSeq: 2,
			status: "completed",
			body: { status: "completed" },
		});
	});

	test("a time out of the Date range is no date", () => {
		const folded = foldEvents([
			{
				seq: 1,
				ts: 0,
				event: {
					...tool("running"),
					item: {
						...(tool("running") as { item: object }).item,
						startedAtMs: 1e20,
					},
				} as DurableEvent,
			},
		]);
		expect(folded.items[0]?.startedAt).toBeNull();
	});

	test("drops availableCommands from the session state", () => {
		const folded = foldEvents([
			{
				seq: 1,
				ts: 0,
				event: {
					type: "session",
					session: {
						status: "idle",
						harness: "claude-acp",
						availableCommands: [{ name: "init", description: "" }],
					},
				} as DurableEvent,
			},
		]);
		expect(folded.session?.state).toEqual({
			status: "idle",
			harness: "claude-acp",
		});
	});
});
