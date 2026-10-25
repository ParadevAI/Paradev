import { describe, expect, test } from "bun:test";
import type { Item } from "@superset/chat/protocol";
import type { TranscriptRow } from "../transcriptRows";
import { replyFooters } from "./replyFooters";

function item(
	id: string,
	kind: Item["kind"],
	groupStart = false,
): TranscriptRow {
	return {
		kind: "item",
		key: id,
		groupStart,
		item: { id, kind, startedAtMs: 0, completedAtMs: 1 } as Item,
	};
}

function working(turnId: string, running: boolean): TranscriptRow {
	return {
		kind: "working",
		key: `working:${turnId}`,
		groupStart: false,
		startedAtMs: 0,
		completedAtMs: running ? undefined : 1,
		running,
	};
}

describe("replyFooters", () => {
	test("puts the footer after the rows that follow the turn's last reply", () => {
		const { rows, inlineReplyKeys } = replyFooters([
			item("prompt-1", "user_message", true),
			working("t1", false),
			item("reply-1", "agent_message"),
			item("tool-1", "tool_call"),
			item("reply-2", "agent_message"),
			item("tool-2", "tool_call"),
			item("prompt-2", "user_message", true),
		]);
		expect(rows.map((row) => row.key)).toEqual([
			"prompt-1",
			"working:t1",
			"reply-1",
			"tool-1",
			"reply-2",
			"tool-2",
			"reply_footer:reply-2",
			"prompt-2",
		]);
		expect(rows[6]?.kind === "reply_footer" && rows[6].item.id).toBe("reply-2");
		expect([...inlineReplyKeys]).toEqual([]);
	});

	test("keeps the footer under a reply that ends its turn", () => {
		const input = [
			item("prompt-1", "user_message", true),
			working("t1", false),
			item("tool-1", "tool_call"),
			item("reply-1", "agent_message"),
		];
		const { rows, inlineReplyKeys } = replyFooters(input);
		expect(rows).toEqual(input);
		expect([...inlineReplyKeys]).toEqual(["reply-1"]);
	});

	test("gives a running turn no footer", () => {
		const input = [
			item("prompt-1", "user_message", true),
			working("t1", true),
			item("reply-1", "agent_message"),
			item("tool-1", "tool_call"),
		];
		const { rows, inlineReplyKeys } = replyFooters(input);
		expect(rows).toEqual(input);
		expect([...inlineReplyKeys]).toEqual([]);
	});
});
