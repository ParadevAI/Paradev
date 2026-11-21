import { expect, test } from "bun:test";
import type { TranscriptRow } from "../../../../utils/transcriptRows";
import { readerPositionAt, restoreTarget } from "./readerAnchor";

function userRow(key: string, text: string): TranscriptRow {
	return {
		kind: "item",
		key,
		groupStart: true,
		item: {
			id: `item-${key}`,
			kind: "user_message",
			startedAtMs: 1,
			content: [{ type: "text", text }],
		},
	};
}

function replyRow(key: string): TranscriptRow {
	return {
		kind: "item",
		key,
		groupStart: false,
		item: {
			id: `item-${key}`,
			kind: "agent_message",
			startedAtMs: 1,
			text: key,
		},
	} as TranscriptRow;
}

function conversation(prefix: string, replyRows: number): TranscriptRow[] {
	return [
		userRow(`${prefix}-u1`, "fix it"),
		replyRow(`${prefix}-r1`),
		userRow(`${prefix}-u2`, "explain"),
		...Array.from({ length: replyRows }, (_, index) =>
			replyRow(`${prefix}-long${index}`),
		),
		userRow(`${prefix}-u3`, "thanks"),
	];
}

test("finds the same row in a replay with new ids, deep inside a long reply", () => {
	const before = conversation("old", 60);
	const position = readerPositionAt(before, 3 + 45, 120);
	expect(position).toEqual({
		userMessagesFromEnd: 1,
		messageText: "explain",
		rowsAfterMessage: 46,
		offsetPx: 120,
	});

	const after = conversation("new", 60);
	if (!position) throw new Error("no position");
	expect(restoreTarget(after, position)).toEqual({
		row: after[3 + 45] as TranscriptRow,
		offsetPx: 120,
	});
});

test("prefers the message with the same text nearest the same place", () => {
	const rows = [
		userRow("a", "fix it"),
		userRow("b", "fix it"),
		userRow("c", "ship it"),
		userRow("d", "thanks"),
	];
	const position = {
		userMessagesFromEnd: 3,
		messageText: "fix it",
		rowsAfterMessage: 0,
		offsetPx: 0,
	};
	expect(restoreTarget(rows, position)?.row.key).toBe("a");
	expect(
		restoreTarget(rows, { ...position, userMessagesFromEnd: 2 })?.row.key,
	).toBe("b");
});

test("falls back to the message itself when the replay has fewer rows after it", () => {
	const rows = [userRow("a", "fix it"), replyRow("r")];
	const target = restoreTarget(rows, {
		userMessagesFromEnd: 0,
		messageText: "fix it",
		rowsAfterMessage: 9,
		offsetPx: 300,
	});
	expect(target).toEqual({ row: rows[0] as TranscriptRow, offsetPx: 0 });
});

test("has no position above the first user message", () => {
	expect(
		readerPositionAt([replyRow("r"), userRow("a", "hi")], 0, 0),
	).toBeNull();
});
