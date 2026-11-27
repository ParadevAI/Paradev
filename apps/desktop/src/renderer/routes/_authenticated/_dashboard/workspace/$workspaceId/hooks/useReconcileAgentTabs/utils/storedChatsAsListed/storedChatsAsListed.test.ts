import { describe, expect, it } from "bun:test";
import { storedChatsAsListed } from "./storedChatsAsListed";

describe("storedChatsAsListed", () => {
	it("lists a cloud workspace's stored chats as open, skipping ones with no agent", () => {
		expect(
			storedChatsAsListed([
				{
					id: "newer",
					title: "Repeated error messages",
					harness: "claude-acp",
					lastActiveAt: new Date(2_000),
				},
				{
					id: "older",
					title: "Older chat",
					harness: "claude-acp",
					lastActiveAt: "1970-01-01T00:00:01.000Z",
				},
				{
					id: "unknown",
					title: null,
					harness: null,
					lastActiveAt: new Date(3_000),
				},
			]).map((chat) => [chat.sessionId, chat.updatedAt, chat.live]),
		).toEqual([
			["newer", 2_000, true],
			["older", 1_000, true],
		]);
	});
});
