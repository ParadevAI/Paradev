import { describe, expect, test } from "bun:test";
import { reduceMany, type SessionSnapshot } from "@superset/chat/core";
import type { Envelope, Item, ToolCall } from "@superset/chat/protocol";
import type { TranscriptRow } from "../../../../utils/transcriptRows";
import { sameRowSnapshot } from "./sameRowSnapshot";

const reply: Item = {
	id: "a-1",
	kind: "agent_message",
	startedAtMs: 1,
	completedAtMs: 2,
	text: "Done.",
};
const streaming: Item = {
	id: "a-2",
	kind: "agent_message",
	startedAtMs: 3,
	text: "",
};
const command: ToolCall = {
	id: "tool-1",
	kind: "tool_call",
	startedAtMs: 4,
	title: "bun test",
	toolKind: "execute",
	toolName: "bash",
	status: "running",
	content: [],
};
const approval = {
	id: "approval-1",
	kind: "approval_request",
	startedAtMs: 5,
	title: "bun test",
	targetItemId: command.id,
	status: "pending",
	options: [],
} as unknown as Item;
const thinking: Item = {
	id: "r-1",
	kind: "reasoning",
	startedAtMs: 6,
	text: "",
};

function snapshotOf(items: readonly Item[], harness = "acp"): SessionSnapshot {
	return {
		session: { status: "running", harness, backgroundTasks: [] },
		turns: new Map(),
		items: new Map(items.map((item) => [item.id, { item, turnId: "t1" }])),
		liveStreams: new Map(),
		cursor: { epoch: "e", seq: 1 },
		pendingReset: null,
	} as unknown as SessionSnapshot;
}

function streamInto(snapshot: SessionSnapshot, itemId: string, append: string) {
	return reduceMany(snapshot, [
		{
			cursor: { epoch: "e", seq: 2 },
			delta: { type: "text", itemId, append },
		} as unknown as Envelope,
	]);
}

function itemRow(item: Item): TranscriptRow {
	return { kind: "item", key: item.id, groupStart: false, item };
}

const toolRun: TranscriptRow = {
	kind: "tool_run",
	key: "run-1",
	groupStart: false,
	items: [command],
	steps: [command, thinking],
	defaultCollapsed: false,
};

describe("sameRowSnapshot", () => {
	const items = [reply, streaming, command, approval, thinking];
	const base = snapshotOf(items);

	test("another message streaming leaves a settled row alone", () => {
		expect(
			sameRowSnapshot(itemRow(reply), base, streamInto(base, "a-2", "Hi")),
		).toBe(true);
	});

	test("the row's own text streaming changes it", () => {
		expect(
			sameRowSnapshot(itemRow(streaming), base, streamInto(base, "a-2", "Hi")),
		).toBe(false);
	});

	test("a tool run changes when its reasoning step streams", () => {
		const next = streamInto(base, thinking.id, "Checking");
		expect(sameRowSnapshot(toolRun, base, next)).toBe(false);
		expect(sameRowSnapshot(toolRun, base, streamInto(base, "a-2", "Hi"))).toBe(
			true,
		);
	});

	test("an approval row follows changes to its target", () => {
		const finished: ToolCall = { ...command, status: "completed" };
		const next = snapshotOf([reply, streaming, finished, approval, thinking]);
		expect(sameRowSnapshot(itemRow(approval), base, next)).toBe(false);
		expect(sameRowSnapshot(itemRow(reply), base, next)).toBe(true);
	});

	test("every row changes when the harness does", () => {
		expect(
			sameRowSnapshot(itemRow(reply), base, snapshotOf(items, "codex")),
		).toBe(false);
	});
});
