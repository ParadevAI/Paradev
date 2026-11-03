import { describe, expect, test } from "bun:test";
import searchCommand from "./command";

describe("sessions search", () => {
	test("asks the API and returns one row per conversation", async () => {
		const calls: unknown[] = [];
		const ctx = {
			api: {
				chatHistory: {
					search: {
						query: async (input: unknown) => {
							calls.push(input);
							return [
								{
									sessionId: "s1",
									itemId: "i1",
									kind: "agent_message",
									title: "Fix \u001b[31muploads",
									harness: "claude-acp",
									harnessSessionId: "h1",
									workspaceId: "w1",
									lastActiveAt: new Date("2026-11-02T00:00:00Z"),
									snippet: "Fixed «acpAdapter»\n.ts",
									score: 0.5,
								},
							];
						},
					},
				},
			},
			config: { organizationId: "org-1" },
			bearer: "bearer",
			authSource: "oauth",
		} as never;

		const result = await searchCommand.run({
			ctx,
			args: { query: "acpAdapter" },
			options: { limit: 5 },
			signal: new AbortController().signal,
		} as never);

		expect(calls).toEqual([{ query: "acpAdapter", limit: 5 }]);
		expect((result as { data: unknown }).data).toEqual([
			{
				sessionId: "s1",
				title: "Fix \u001b[31muploads",
				workspaceId: "w1",
				harness: "claude-acp",
				snippet: "Fixed «acpAdapter» .ts",
				score: 0.5,
				lastActiveAt: "2026-11-02T00:00:00.000Z",
			},
		]);
	});

	test("shows control characters in chat text as escapes", () => {
		const output = searchCommand.display?.([
			{
				sessionId: "s1",
				title: "a\u001b[2Jb\u009b2J",
				snippet: "c\u0007d\u0085e",
			},
		] as never);
		expect(output).toContain("a\\x1b[2Jb\\x9b2J");
		expect(output).toContain("c\\x07d\\x85e");
		expect(output).not.toMatch(/(?![\t\n])\p{Cc}/u);
	});
});
