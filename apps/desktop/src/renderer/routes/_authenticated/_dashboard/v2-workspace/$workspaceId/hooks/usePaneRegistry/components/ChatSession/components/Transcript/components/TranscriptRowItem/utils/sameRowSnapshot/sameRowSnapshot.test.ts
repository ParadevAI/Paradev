import { describe, expect, test } from "bun:test";
import { reduceMany, type SessionSnapshot } from "@superset/chat/core";
import type { Envelope, Item } from "@superset/chat/protocol";
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
const approval: Item = {
	id: "approval-1",
	kind: "approval_request",
	startedAtMs: 4,
	title: "Run tests",
	status: "pending",
	options: [],
} as unknown as Item;

function snapshotOf(items: readonly Item[]): SessionSnapshot {
	return {
		session: { status: "running", harness: "acp", backgroundTasks: [] },
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

describe("sameRowSnapshot", () => {
	const base = snapshotOf([reply, streaming, approval]);

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

	test("an approval row follows changes to the items it looks up", () => {
		const next = snapshotOf([reply, streaming, approval]);
		expect(sameRowSnapshot(itemRow(approval), base, next)).toBe(false);
		expect(sameRowSnapshot(itemRow(reply), base, next)).toBe(true);
	});
});
