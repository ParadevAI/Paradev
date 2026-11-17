import { describe, expect, test } from "bun:test";
import type {
	AgentMessage,
	Item,
	Notice,
	ToolCall,
} from "@superset/chat/protocol";
import {
	firstLinePreview,
	type RunContext,
	subagentLaunches,
	subagentRunCard,
} from "./subagentRuns";

function subagent(id: string, overrides: Partial<ToolCall> = {}): ToolCall {
	return {
		id,
		kind: "tool_call",
		title: id,
		toolKind: "think",
		toolName: "subagent",
		status: "running",
		subagent: true,
		content: [{ type: "text", text: `Task for ${id}` }],
		startedAtMs: 1_000,
		...overrides,
	};
}

function tool(
	id: string,
	parentItemId: string,
	overrides: Partial<ToolCall> = {},
): ToolCall {
	return {
		id,
		parentItemId,
		kind: "tool_call",
		title: `Run ${id}`,
		toolKind: "execute",
		toolName: "Bash",
		status: "completed",
		content: [],
		startedAtMs: 2_000,
		completedAtMs: 3_000,
		...overrides,
	};
}

function reply(
	id: string,
	parentItemId: string,
	text: string,
	model?: string,
): AgentMessage {
	return {
		id,
		parentItemId,
		kind: "agent_message",
		text,
		startedAtMs: 4_000,
		completedAtMs: 5_000,
		...(model ? { model } : {}),
	};
}

function context(
	items: readonly Item[],
	live: { taskIds?: string[] | null; turnRunning?: boolean } = {},
): RunContext {
	const childrenByParent = new Map<string, Item[]>();
	for (const item of items) {
		if (!item.parentItemId) continue;
		childrenByParent.set(item.parentItemId, [
			...(childrenByParent.get(item.parentItemId) ?? []),
			item,
		]);
	}
	return {
		childrenByParent,
		liveTaskIds: live.taskIds === null ? null : new Set(live.taskIds ?? []),
		turnRunning: () => live.turnRunning ?? false,
		textOf: (item) => (item as AgentMessage).text ?? "",
	};
}

describe("subagentRunCard", () => {
	test("stacks launches of one step as rows, with live counts and the current step", () => {
		const a = subagent("subagent:a");
		const b = subagent("subagent:b");
		const c = subagent("subagent:c", {
			status: "completed",
			completedAtMs: 9_000,
		});
		const items = [
			a,
			b,
			c,
			tool("a-1", a.id, { status: "running", title: "wc -l /etc/hosts" }),
			reply(
				"c-reply",
				c.id,
				"## Result\n**10** lines in `/etc/hosts`",
				"Haiku",
			),
		];
		const card = subagentRunCard(
			[a, b, c],
			context(items, { taskIds: [a.id, b.id] }),
		);

		expect(card.rows.map((row) => row.phase)).toEqual([
			"running",
			"running",
			"finished",
		]);
		expect(card.live).toBe(true);
		expect(card.counts).toMatchObject({ running: 2, finished: 1 });
		expect(card.rows[0]?.action).toBe("wc -l /etc/hosts");
		expect(card.rows[2]).toMatchObject({
			outcome: "Result",
			model: "Haiku",
			endedAtMs: 9_000,
		});
		expect(card.endedAtMs).toBeNull();
	});

	test("shows a resumed child as a run of its own, beside its first run", () => {
		const first = subagent("subagent:b", {
			status: "completed",
			completedAtMs: 4_000,
		});
		const resumed = subagent("subagent:b:generation:2", {
			title: "subagent:b",
			startedAtMs: 6_000,
		});
		const items = [
			first,
			resumed,
			reply("b-1", first.id, "Moved the count into the background"),
			tool("b-2", resumed.id, { status: "running", title: "Read output" }),
		];
		const ctx = context(items, { taskIds: [resumed.id] });

		const firstCard = subagentRunCard([first], ctx);
		const resumedCard = subagentRunCard([resumed], ctx);
		expect(firstCard.rows[0]).toMatchObject({
			phase: "finished",
			outcome: "Moved the count into the background",
		});
		expect(resumedCard.rows[0]).toMatchObject({
			phase: "running",
			action: "Read output",
			startedAtMs: 6_000,
		});
	});

	test("settles a child that never reported an end as stopped once nothing runs it", () => {
		const orphan = subagent("subagent:a");
		const items = [orphan, tool("a-1", orphan.id, { completedAtMs: 7_000 })];

		const sessionGone = subagentRunCard(
			[orphan],
			context(items, { taskIds: [] }),
		);
		expect(sessionGone.rows[0]).toMatchObject({
			phase: "stopped",
			action: "Run a-1",
			endedAtMs: 7_000,
			canStop: false,
		});
		expect(sessionGone.live).toBe(false);

		const stored = subagentRunCard(
			[orphan],
			context(items, { taskIds: null, turnRunning: true }),
		);
		expect(stored.rows[0]?.phase).toBe("stopped");

		const turnStillRuns = subagentRunCard(
			[orphan],
			context(items, { turnRunning: true }),
		);
		expect(turnStillRuns.rows[0]?.phase).toBe("running");
	});

	test("says a parent waits while only its nested subagents work", () => {
		const parent = subagent("subagent:p", { canStop: true });
		const launcher = tool("launch", parent.id, {
			status: "completed",
			title: "spawn",
			toolName: "spawn",
		});
		const child = subagent("subagent:c", { parentItemId: launcher.id });
		const items = [parent, launcher, child];

		const card = subagentRunCard(
			[parent],
			context(items, { taskIds: [parent.id, child.id] }),
		);
		expect(card.rows[0]).toMatchObject({ phase: "waiting", canStop: true });
		expect(card.rows[0]?.nested.map((row) => row.phase)).toEqual(["running"]);
	});

	test("gives a failed child's error line and the files it changed", () => {
		const failed = subagent("subagent:f", {
			status: "failed",
			subagentStatus: "failed",
			completedAtMs: 8_000,
		});
		const error: Notice = {
			id: "f-error",
			parentItemId: failed.id,
			kind: "notice",
			noticeKind: "error",
			text: "Rate limited\nretry later",
			startedAtMs: 7_000,
		};
		const edit = tool("f-edit", failed.id, {
			toolKind: "edit",
			toolName: "Edit",
			content: [
				{ type: "diff", path: "/repo/a.ts", oldText: "a", newText: "b" },
			],
		});
		const card = subagentRunCard([failed], context([failed, edit, error]));
		expect(card.rows[0]).toMatchObject({
			phase: "failed",
			outcome: "Rate limited",
			files: ["/repo/a.ts"],
		});
		expect(card.counts.failed).toBe(1);
		expect(card.endedAtMs).toBe(8_000);
	});
});

describe("subagentLaunches", () => {
	test("reads a subagent item, a launcher of subagents, and a Task call with children", () => {
		const child = subagent("subagent:x", { parentItemId: "launch" });
		const launcher = tool("launch", "", { parentItemId: undefined });
		const task = tool("task", "", {
			parentItemId: undefined,
			toolName: "Task",
		});
		const plain = tool("plain", "", { parentItemId: undefined });

		expect(subagentLaunches(child, undefined)).toEqual([child]);
		expect(subagentLaunches(launcher, [child])).toEqual([child]);
		expect(subagentLaunches(task, [tool("t-1", "task")])).toEqual([task]);
		expect(subagentLaunches(task, undefined)).toBeNull();
		expect(subagentLaunches(plain, [tool("p-1", "plain")])).toBeNull();
	});
});

test("firstLinePreview takes the first line of prose and caps it", () => {
	expect(firstLinePreview("\n```ts\n- **Done**: `x`")).toBe("Done: x");
	expect(firstLinePreview("a".repeat(200))?.length).toBe(160);
	expect(firstLinePreview("   ")).toBeNull();
});
