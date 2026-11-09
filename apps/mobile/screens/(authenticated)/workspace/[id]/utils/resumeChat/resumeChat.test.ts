import { describe, expect, test } from "bun:test";
import { resumeChat } from "./resumeChat";

describe("resumeChat", () => {
	test("closes the old chat, then replaces it with a resumed one", async () => {
		const calls: unknown[] = [];
		const sessionId = await resumeChat({
			transport: {
				closeSession: async (input) => {
					calls.push(["close", input]);
					throw new Error("already closed");
				},
				createSession: async (input) => {
					calls.push(["create", input]);
					return { sessionId: "new-session" } as never;
				},
			},
			workspaceId: "workspace-1",
			chat: {
				sessionId: "old-session",
				harness: "claude-acp",
				harnessSessionId: "native-1",
			},
			commandId: "command-1",
		});
		expect(sessionId).toBe("new-session");
		expect(calls).toEqual([
			["close", { sessionId: "old-session" }],
			[
				"create",
				{
					commandId: "command-1",
					workspaceId: "workspace-1",
					harness: "claude-acp",
					resume: {
						harnessSessionId: "native-1",
						replacesSessionId: "old-session",
					},
				},
			],
		]);
	});
});
