import { describe, expect, test } from "bun:test";
import { resumeChat } from "./resumeChat";

const input = {
	commandId: "00000000-0000-4000-8000-000000000000",
	workspaceId: "workspace-1",
	sessionId: "stopped",
	harness: "claude-acp",
	harnessSessionId: "agent-1",
};

describe("resumeChat", () => {
	test("closes the stopped chat, then starts one that takes it over", async () => {
		const calls: unknown[] = [];
		const sessionId = await resumeChat(
			{
				closeSession: async (closed) => {
					calls.push(["close", closed]);
				},
				createSession: async (created) => {
					calls.push(["create", created]);
					return { sessionId: "resumed", epoch: "e1" };
				},
			},
			input,
		);
		expect(sessionId).toBe("resumed");
		expect(calls).toEqual([
			["close", { sessionId: "stopped" }],
			[
				"create",
				{
					commandId: input.commandId,
					workspaceId: "workspace-1",
					harness: "claude-acp",
					resume: { harnessSessionId: "agent-1", replacesSessionId: "stopped" },
				},
			],
		]);
	});

	test("a close that fails does not stop the resume", async () => {
		const sessionId = await resumeChat(
			{
				closeSession: async () => {
					throw new Error("already closed");
				},
				createSession: async () => ({ sessionId: "resumed", epoch: "e1" }),
			},
			input,
		);
		expect(sessionId).toBe("resumed");
	});
});
