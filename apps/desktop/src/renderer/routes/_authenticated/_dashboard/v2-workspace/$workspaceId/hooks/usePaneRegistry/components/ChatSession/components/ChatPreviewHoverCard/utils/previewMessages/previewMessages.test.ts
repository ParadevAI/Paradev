import { expect, test } from "bun:test";
import type { Envelope, Item } from "@superset/chat/protocol";
import { previewMessages } from "./previewMessages";

let seq = 0;
function itemEnvelope(item: Item): Envelope {
	seq += 1;
	return {
		v: 1,
		sessionId: "s1",
		ts: 1000 + seq,
		cursor: { epoch: "e1", seq },
		event: { type: "item", item, turnId: "t1" },
	};
}

const user = (id: string, text: string, hidden?: string): Item => ({
	kind: "user_message",
	id,
	startedAtMs: 1,
	content: [
		{ type: "text", text },
		...(hidden ? [{ type: "text" as const, text: hidden, hidden: true }] : []),
	],
});
const agent = (id: string, text: string): Item => ({
	kind: "agent_message",
	id,
	text,
	startedAtMs: 1,
});

test("keeps the last few messages, without hidden context, as excerpts", () => {
	const envelopes = [
		user("u1", "first question"),
		agent("a1", "first answer"),
		user("u2", "Fix   the\nlogin", "MCP context: use linear"),
		{
			kind: "tool_call",
			id: "tc",
			title: "run",
			toolKind: "execute",
			toolName: "bash",
			status: "completed",
			content: [],
			startedAtMs: 2,
		} as Item,
		agent("a2", "x".repeat(400)),
		user("u3", "thanks"),
	].map(itemEnvelope);
	const messages = previewMessages(envelopes);
	expect(messages.map((message) => message.id)).toEqual([
		"a1",
		"u2",
		"a2",
		"u3",
	]);
	expect(messages[1]).toEqual({
		id: "u2",
		from: "user",
		text: "Fix the login",
	});
	expect(messages[2]?.text).toHaveLength(220);
	expect(messages[2]?.text.endsWith("…")).toBe(true);
});

test("an empty chat has nothing to preview", () => {
	expect(previewMessages([])).toEqual([]);
});
