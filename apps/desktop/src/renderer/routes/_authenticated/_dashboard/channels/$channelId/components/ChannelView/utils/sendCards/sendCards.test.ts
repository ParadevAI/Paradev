import { describe, expect, test } from "bun:test";
import { claudeTool } from "../toolText/toolText.test-data";
import { sendCardsFromTool } from "./sendCards";

const WORKSPACE = "5a6ff25a-3d1e-4f6b-9c1a-2b3c4d5e6f70";

describe("sendCardsFromTool", () => {
	test("reads what the coordinator told the agent", () => {
		const tool = claudeTool(
			`superset sessions send --local --workspace ${WORKSPACE} --session s-77 --prompt "Reply with the word hello and nothing else."`,
			"Sent.",
		);
		expect(sendCardsFromTool(tool)).toEqual([
			{
				kind: "sent",
				key: `sent:${tool.id}`,
				workspaceId: WORKSPACE,
				sessionId: "s-77",
				text: "Reply with the word hello and nothing else.",
			},
		]);
	});

	test("a prompt built by the shell says nothing about what was sent", () => {
		const tool = claudeTool(
			`superset sessions send --workspace ${WORKSPACE} --session s-77 --prompt "$(cat brief.md)"`,
			"",
		);
		expect(sendCardsFromTool(tool)).toEqual([]);
	});
});
