import { describe, expect, test } from "bun:test";
import { claudeTool } from "../toolText/toolText.test-data";
import { sessionCardsFromTool } from "./sessionCards";

const WORKSPACE = "a94e7f3d-f144-4fee-9bee-c84e38765186";
const SESSION = "0e1f2a3b-4c5d-6e7f-8a9b-0c1d2e3f4a5b";

describe("sessionCardsFromTool", () => {
	test("reads the session a create command started and the prompt it gave", () => {
		const command = `superset sessions create --local --workspace ${WORKSPACE} --agent claude --prompt "Investigate the title tabs.\nReport here." --json`;
		const output = `\`\`\`console\n{\n  "sessionId": "${SESSION}",\n  "label": "Claude",\n  "harness": "claude-acp"\n}\n\`\`\``;
		expect(sessionCardsFromTool(claudeTool(command, output))).toEqual([
			{
				kind: "session",
				key: `session:${SESSION}`,
				workspaceId: WORKSPACE,
				sessionId: SESSION,
				agent: "Claude",
				prompt: "Investigate the title tabs.",
				text: "Investigate the title tabs.\nReport here.",
			},
		]);
	});

	test("reads the human message when there is no json", () => {
		const command = `superset sessions create --workspace ${WORKSPACE} --agent codex`;
		const output = `Started Codex chat session ${SESSION} in workspace ${WORKSPACE}`;
		expect(sessionCardsFromTool(claudeTool(command, output))).toEqual([
			{
				kind: "session",
				key: `session:${SESSION}`,
				workspaceId: WORKSPACE,
				sessionId: SESSION,
				agent: "Codex",
				prompt: null,
				text: null,
			},
		]);
	});

	test("shows no prompt when it came from a command substitution", () => {
		const command = `superset sessions create --workspace ${WORKSPACE} --agent claude --prompt "$(cat /tmp/prompts/title-tabs.md)" --json`;
		const output = `{"sessionId": "${SESSION}", "label": "Claude"}`;
		expect(sessionCardsFromTool(claudeTool(command, output))[0]).toMatchObject({
			kind: "session",
			prompt: null,
		});
	});

	test("ignores other commands and failed creates", () => {
		expect(
			sessionCardsFromTool(
				claudeTool(`superset sessions list --workspace ${WORKSPACE}`, "[]"),
			),
		).toEqual([]);
		expect(
			sessionCardsFromTool(
				claudeTool(
					`superset sessions create --workspace ${WORKSPACE} --agent claude`,
					"Error: workspace not found",
				),
			),
		).toEqual([]);
	});
});
