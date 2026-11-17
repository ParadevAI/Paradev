import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { ChatBrief } from "../model/model.ts";
import { briefsOf, withBrief } from "./chat-briefs.ts";

const base: ChatState = {
	meId: "me",
	members: {},
	devs: {},
	chats: [],
	messages: [],
	tasks: [],
	apps: [],
};
const brief = (
	devId: string,
	at: string,
	topics = [{ topic: "Billing", line: "blocked", needsYou: true }],
): ChatBrief => ({ chatId: "c", devId, topics, updatedAt: at });

describe("chat briefs", () => {
	test("a Dev's newer brief replaces its older one; an older write changes nothing", () => {
		const one = withBrief(base, brief("sam", "2026-11-09T10:00:00Z"));
		const two = withBrief(
			one,
			brief("sam", "2026-11-09T11:00:00Z", [
				{ topic: "Notion", line: "PR open", needsYou: false },
			]),
		);
		expect(two.briefs).toHaveLength(1);
		expect(two.briefs![0]!.topics[0]!.topic).toBe("Notion");
		expect(withBrief(two, brief("sam", "2026-11-09T09:00:00Z"))).toBe(two);
	});

	test("a chat's briefs, newest first, leaving out cleared ones", () => {
		let s = withBrief(base, brief("sam", "2026-11-09T10:00:00Z"));
		s = withBrief(s, brief("coda", "2026-11-09T12:00:00Z"));
		s = withBrief(s, brief("fin", "2026-11-09T13:00:00Z", []));
		expect(briefsOf(s, "c").map((b) => b.devId)).toEqual(["coda", "sam"]);
	});
});
