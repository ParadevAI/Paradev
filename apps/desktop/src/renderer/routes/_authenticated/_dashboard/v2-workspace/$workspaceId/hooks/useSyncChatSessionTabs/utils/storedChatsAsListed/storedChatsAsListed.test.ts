import { describe, expect, it } from "bun:test";
import { chatSessionsToAdopt } from "../chatSessionsToAdopt";
import { storedChatsAsListed } from "./storedChatsAsListed";

describe("storedChatsAsListed", () => {
	it("turns a cloud workspace's stored chats into tabs, newest last, skipping ones with no agent", () => {
		const targets = chatSessionsToAdopt({
			sessions: storedChatsAsListed([
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
			]),
			tabs: [],
			workspaceId: "cloud-1",
		});
		expect(
			targets.map((target) => [target.sessionId, target.terminalId]),
		).toEqual([
			["older", "older"],
			["newer", "newer"],
		]);
	});
});
