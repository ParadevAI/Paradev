import { describe, expect, test } from "bun:test";
import type { DurableEnvelope } from "../../protocol/envelope";
import type { Item, ToolCall } from "../../protocol/items";
import { emptySnapshot, reduceMany } from "../reducer/reducer";
import {
	collapseWorkLog,
	deriveChildrenByParent,
	derivePendingApprovals,
	deriveQueuedPrompts,
	deriveTimeline,
} from "./deriveTimeline";

function toolCall(
	id: string,
	status: ToolCall["status"],
	startedAtMs: number,
): ToolCall {
	return {
		kind: "tool_call",
		id,
		title: id,
		toolKind: "read",
		toolName: "Read",
		status,
		content: [],
		startedAtMs,
	};
}

function message(id: string, startedAtMs: number): Item {
	return { kind: "agent_message", id, text: id, startedAtMs };
}

let seq = 0;
function env(item: Item, turnId: string): DurableEnvelope {
	seq += 1;
	return {
		v: 1,
		sessionId: "s1",
		ts: seq,
		cursor: { epoch: "e1", seq },
		event: { type: "item", item, turnId },
	};
}

describe("collapseWorkLog", () => {
	test("collapses runs of tool calls and leaves singles inline", () => {
		const items: Item[] = [
			message("m1", 1),
			toolCall("tc1", "completed", 2),
			toolCall("tc2", "completed", 3),
			toolCall("tc3", "declined", 4),
			message("m2", 5),
			toolCall("tc4", "completed", 6),
		];
		const entries = collapseWorkLog(items);
		expect(entries.map((e) => e.kind)).toEqual([
			"item",
			"tool_run",
			"item",
			"item",
		]);
		const run = entries[1];
		if (run?.kind !== "tool_run") throw new Error("expected tool_run");
		expect(run.items.map((i) => i.id)).toEqual(["tc1", "tc2", "tc3"]);
	});

	test("a running tool call joins the run it continues", () => {
		const entries = collapseWorkLog([
			toolCall("tc1", "completed", 1),
			toolCall("tc2", "running", 2),
		]);
		expect(entries.map((e) => e.kind)).toEqual(["tool_run"]);
		const run = entries[0];
		if (run?.kind !== "tool_run") throw new Error("expected tool_run");
		expect(run.items.map((i) => i.id)).toEqual(["tc1", "tc2"]);
	});
});

describe("deriveTimeline", () => {
	test("groups by turn, sorts items, and orders turns by start", () => {
		seq = 0;
		const snapshot = reduceMany(emptySnapshot(), [
			env(message("m2", 20), "t2"),
			env(message("m1", 10), "t1"),
			env(toolCall("tc1", "completed", 11), "t1"),
			{
				v: 1,
				sessionId: "s1",
				ts: 99,
				cursor: { epoch: "e1", seq: 99 },
				event: {
					type: "turn",
					turn: { id: "t1", status: "completed", startedAtMs: 10 },
				},
			},
			{
				v: 1,
				sessionId: "s1",
				ts: 100,
				cursor: { epoch: "e1", seq: 100 },
				event: {
					type: "turn",
					turn: { id: "t2", status: "running", startedAtMs: 20 },
				},
			},
		]);
		const groups = deriveTimeline(snapshot);
		expect(groups.map((g) => g.turnId)).toEqual(["t1", "t2"]);
		const firstEntry = groups[0]?.entries[0];
		if (firstEntry?.kind !== "item") throw new Error("expected item entry");
		expect(firstEntry.item.id).toBe("m1");
	});
});

describe("deriveTimeline with nested items", () => {
	function subagentTool(id: string, startedAtMs: number): ToolCall {
		return { ...toolCall(id, "completed", startedAtMs), subagent: true };
	}

	test("nestChildItems drops children with a known parent from the top level", () => {
		seq = 0;
		const child: ToolCall = {
			...toolCall("sub:c1:bash-1", "completed", 11),
			parentItemId: "subagent:c1",
		};
		const snapshot = reduceMany(emptySnapshot(), [
			env(subagentTool("subagent:c1", 10), "t1"),
			env(child, "t1"),
			env(message("m1", 12), "t1"),
		]);

		const nested = deriveTimeline(snapshot, { nestChildItems: true });
		const ids = nested[0]?.entries.map((entry) =>
			entry.kind === "item" ? entry.item.id : "run",
		);
		expect(ids).toEqual(["subagent:c1", "m1"]);

		// Without nesting, the child joins its parent's run at the top level.
		const flat = deriveTimeline(snapshot);
		const flatFirst = flat[0]?.entries[0];
		if (flatFirst?.kind !== "tool_run") throw new Error("expected tool_run");
		expect(flatFirst.items.map((item) => item.id)).toEqual([
			"subagent:c1",
			"sub:c1:bash-1",
		]);
	});

	test("a pending subagent approval stays top-level and nests once answered", () => {
		seq = 0;
		const approval: Item = {
			kind: "approval_request",
			id: "approval:sub:c1:bash-1",
			targetItemId: "sub:c1:bash-1",
			title: "Allow Bash?",
			status: "pending",
			startedAtMs: 11,
			parentItemId: "subagent:c1",
		};
		const topLevelIds = (items: Item[]) =>
			deriveTimeline(
				reduceMany(
					emptySnapshot(),
					items.map((item) => env(item, "t1")),
				),
				{ nestChildItems: true },
			)[0]?.entries.map((entry) =>
				entry.kind === "item" ? entry.item.id : "run",
			);

		expect(topLevelIds([subagentTool("subagent:c1", 10), approval])).toEqual([
			"subagent:c1",
			"approval:sub:c1:bash-1",
		]);
		expect(
			topLevelIds([
				subagentTool("subagent:c1", 10),
				{ ...approval, status: "answered", decision: { type: "accept" } },
			]),
		).toEqual(["subagent:c1"]);
	});

	test("a child whose parent is missing stays at the top level", () => {
		seq = 0;
		const orphan: ToolCall = {
			...toolCall("sub:c1:bash-1", "completed", 11),
			parentItemId: "subagent:c1",
		};
		const snapshot = reduceMany(emptySnapshot(), [env(orphan, "t1")]);
		const groups = deriveTimeline(snapshot, { nestChildItems: true });
		expect(groups[0]?.entries.length).toBe(1);
	});
});

describe("deriveChildrenByParent", () => {
	test("groups children under their parent, sorted by start", () => {
		seq = 0;
		const child = (id: string, startedAtMs: number): ToolCall => ({
			...toolCall(id, "completed", startedAtMs),
			parentItemId: "subagent:c1",
		});
		const snapshot = reduceMany(emptySnapshot(), [
			env(subagentParent(), "t1"),
			env(child("b", 2), "t1"),
			env(child("a", 1), "t1"),
			env(message("m1", 3), "t1"),
		]);
		const map = deriveChildrenByParent(snapshot);
		expect(map.get("subagent:c1")?.map((item) => item.id)).toEqual(["a", "b"]);
		expect(map.size).toBe(1);
	});

	test("keeps a list's identity while the parent's children are unchanged", () => {
		seq = 0;
		const child: ToolCall = {
			...toolCall("sub:c1:bash-1", "completed", 2),
			parentItemId: "subagent:c1",
		};
		const first = deriveChildrenByParent(
			reduceMany(emptySnapshot(), [
				env(subagentParent(), "t1"),
				env(child, "t1"),
			]),
		);
		// An unrelated item arrives; the child list itself is untouched.
		const second = deriveChildrenByParent(
			reduceMany(emptySnapshot(), [
				env(subagentParent(), "t1"),
				env(child, "t1"),
				env(message("m1", 3), "t1"),
			]),
			first,
		);
		expect(second.get("subagent:c1")).toBe(first.get("subagent:c1"));
	});

	function subagentParent(): ToolCall {
		return {
			...toolCall("subagent:c1", "completed", 1),
			subagent: true,
		};
	}
});

describe("derivePendingApprovals", () => {
	test("returns only pending approvals in order", () => {
		seq = 0;
		const approval = (
			id: string,
			status: "pending" | "answered",
			startedAtMs: number,
		): Item => ({
			kind: "approval_request",
			id,
			targetItemId: null,
			title: id,
			status,
			startedAtMs,
		});
		const snapshot = reduceMany(emptySnapshot(), [
			env(approval("a2", "pending", 2), "t1"),
			env(approval("a1", "pending", 1), "t1"),
			env(approval("a3", "answered", 3), "t1"),
		]);
		expect(derivePendingApprovals(snapshot).map((a) => a.id)).toEqual([
			"a1",
			"a2",
		]);
	});
});

describe("deriveQueuedPrompts", () => {
	function prompt(id: string, extra: Record<string, unknown> = {}): Item {
		return {
			kind: "user_message",
			id,
			startedAtMs: 1,
			content: [{ type: "text", text: id }],
			...extra,
		};
	}

	test("moves queued prompts out of the timeline and drops discarded ones", () => {
		const snapshot = reduceMany(emptySnapshot(), [
			env(prompt("sent"), "t1"),
			env(prompt("waiting", { queued: true }), "q1"),
			env(prompt("dropped", { queued: true }), "q2"),
			env(prompt("dropped", { discarded: true }), "q2"),
		]);

		expect(deriveQueuedPrompts(snapshot).map((item) => item.id)).toEqual([
			"waiting",
		]);
		const timelineIds = deriveTimeline(snapshot).flatMap((group) =>
			group.entries.flatMap((entry) =>
				entry.kind === "item" ? [entry.item.id] : [],
			),
		);
		expect(timelineIds).toEqual(["sent"]);
	});

	test("an older page cannot bring back a discarded prompt", () => {
		const latest = reduceMany(emptySnapshot(), [
			env(prompt("dropped", { discarded: true }), "q2"),
		]);
		const older = reduceMany(emptySnapshot(), [
			env(prompt("dropped", { queued: true }), "q2"),
		]);
		const merged = {
			...latest,
			items: new Map([...older.items, ...latest.items]),
		};
		expect(deriveQueuedPrompts(merged)).toEqual([]);
	});
});
