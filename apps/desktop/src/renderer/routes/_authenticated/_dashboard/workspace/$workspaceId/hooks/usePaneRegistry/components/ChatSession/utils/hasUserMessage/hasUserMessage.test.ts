import { expect, test } from "bun:test";
import type { StoredItem } from "@superset/chat/core";
import { hasUserMessage } from "./hasUserMessage";

test("only a user message counts", () => {
	expect(hasUserMessage(new Map())).toBe(false);
	const reply = new Map<string, StoredItem>([
		[
			"a1",
			{
				turnId: "t1",
				item: {
					id: "a1",
					kind: "agent_message",
					startedAtMs: 1,
					text: "hi",
				},
			},
		],
	]);
	expect(hasUserMessage(reply)).toBe(false);
	reply.set("m1", {
		turnId: "t1",
		item: {
			id: "m1",
			kind: "user_message",
			startedAtMs: 0,
			content: [{ type: "text", text: "fix the login bug" }],
		},
	});
	expect(hasUserMessage(reply)).toBe(true);
});
