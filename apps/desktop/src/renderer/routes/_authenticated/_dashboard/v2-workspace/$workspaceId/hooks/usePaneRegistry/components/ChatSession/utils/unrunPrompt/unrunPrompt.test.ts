import { expect, test } from "bun:test";
import type { TurnGroup } from "@superset/chat/core";
import { unrunPrompt } from "./unrunPrompt";

const user = {
	kind: "item" as const,
	item: {
		id: "u1",
		kind: "user_message" as const,
		startedAtMs: 0,
		content: [
			{ type: "text" as const, text: 'read this <attachment path="a.ts" />' },
		],
	},
};
const notice = {
	kind: "item" as const,
	item: {
		id: "n1",
		kind: "notice" as const,
		noticeKind: "error" as const,
		text: "Authentication required",
		startedAtMs: 1,
	},
};
const reply = {
	kind: "item" as const,
	item: { id: "a1", kind: "agent_message" as const, startedAtMs: 2 },
};

test("a turn the agent did nothing with gives back its prompt as sent, attachments included", () => {
	const groups = [
		{ turnId: "t1", turn: null, entries: [user, notice] },
	] as unknown as TurnGroup[];
	expect(unrunPrompt(groups)).toBe('read this <attachment path="a.ts" />');
});

test("a turn the agent already worked on gives nothing back", () => {
	const groups = [
		{ turnId: "t1", turn: null, entries: [user, reply, notice] },
	] as unknown as TurnGroup[];
	expect(unrunPrompt(groups)).toBeUndefined();
});
