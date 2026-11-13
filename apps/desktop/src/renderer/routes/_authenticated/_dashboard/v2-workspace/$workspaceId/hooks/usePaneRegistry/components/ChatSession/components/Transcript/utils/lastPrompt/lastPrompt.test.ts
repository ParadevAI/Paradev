import { expect, test } from "bun:test";
import type { TranscriptRow } from "../transcriptRows";
import { lastPrompt } from "./lastPrompt";

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

function queuedRow(key: string, text: string): TranscriptRow {
	return {
		kind: "outbox",
		key,
		groupStart: true,
		entry: { clientId: key, content: [{ type: "text", text }] },
	} as TranscriptRow;
}

test("takes the newest prompt, as one line without its attachment tags", () => {
	const rows = [
		userRow("u1", "fix it"),
		replyRow("r1"),
		userRow(
			"u2",
			'read this\n<attachment path=".paradev/attachments/a.png" type="image/png" />\nplease',
		),
		replyRow("r2"),
	];
	expect(lastPrompt(rows, "claude-acp")).toEqual({
		key: "u2",
		messageId: "item-u2",
		text: "read this please",
	});
});

test("skips bookkeeping the harness injected, and a queued prompt", () => {
	const rows = [
		userRow("u1", "fix it"),
		replyRow("r1"),
		userRow("u2", "<system-reminder>be nice</system-reminder>"),
		queuedRow("q1", "and then deploy"),
	];
	expect(lastPrompt(rows, "claude-acp")).toEqual({
		key: "u1",
		messageId: "item-u1",
		text: "fix it",
	});
});

test("pins nothing rather than an older prompt when the newest has no line", () => {
	const rows = [
		userRow("u1", "fix it"),
		replyRow("r1"),
		userRow(
			"u2",
			'<attachment path=".paradev/attachments/a.png" type="image/png" />',
		),
		replyRow("r2"),
	];
	expect(lastPrompt(rows, "claude-acp")).toBeNull();
});

test("falls back to the pasted text of a message that is only a paste", () => {
	const rows = [
		userRow(
			"u1",
			'<pasted_text lines="2">\nline one\nline two\n</pasted_text>',
		),
		replyRow("r1"),
	];
	expect(lastPrompt(rows, "claude-acp")?.text).toBe("line one line two");
});

test("has nothing to pin without a prompt", () => {
	expect(lastPrompt([replyRow("r1")], "claude-acp")).toBeNull();
});
