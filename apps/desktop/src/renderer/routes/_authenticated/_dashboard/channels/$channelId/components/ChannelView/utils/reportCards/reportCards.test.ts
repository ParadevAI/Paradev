import { describe, expect, test } from "bun:test";
import { claudeTool } from "../toolText/toolText.test-data";
import { reportCardsFromTool } from "./reportCards";

const WORKSPACE = "a94e7f3d-f144-4fee-9bee-c84e38765186";
const COMMAND = `superset sessions read --local --workspace ${WORKSPACE} --session s-77 --limit 50`;

describe("reportCardsFromTool", () => {
	test("takes the newest agent message from the human format, continuation lines included", () => {
		const output = [
			"[session] claude-acp: idle",
			"[user] Investigate the tabs.",
			"[agent] On it.",
			"[tool:Bash] git status (completed)",
			"[agent] Found three problems:",
			"1. The tab strip clips.",
			"2. Close buttons overlap.",
			"",
			"Opened a PR.",
			"[turn t2] completed",
			"",
			'Older events: --before \'{"epoch":"e","seq":1}\'',
		].join("\n");
		expect(reportCardsFromTool(claudeTool(COMMAND, output))).toEqual([
			{
				kind: "report",
				key: expect.stringMatching(/^report:s-77:/),
				workspaceId: WORKSPACE,
				sessionId: "s-77",
				text: "Found three problems:\n1. The tab strip clips.\n2. Close buttons overlap.\n\nOpened a PR.",
			},
		]);
	});

	test("takes the newest agent message from json output, cut short or not", () => {
		const page = {
			ok: true,
			envelopes: [
				{
					event: {
						type: "item",
						item: { kind: "agent_message", text: "First." },
					},
				},
				{ event: { type: "item", item: { kind: "tool_call", title: "ls" } } },
				{
					event: {
						type: "item",
						item: { kind: "agent_message", text: 'Done: "2" files.' },
					},
				},
			],
		};
		const json = JSON.stringify(page, null, 2);
		expect(
			reportCardsFromTool(claudeTool(`${COMMAND} --json`, json))[0],
		).toMatchObject({
			kind: "report",
			text: 'Done: "2" files.',
		});
		const cut = `${json.slice(0, json.lastIndexOf("tool_call"))}\n[Output truncated]`;
		expect(
			reportCardsFromTool(claudeTool(`${COMMAND} --json`, cut))[0],
		).toMatchObject({
			kind: "report",
			text: "First.",
		});
	});

	test("keeps the card without text for a session that has not spoken, and none for other commands", () => {
		expect(
			reportCardsFromTool(claudeTool(COMMAND, "[user] Go.\n[turn t1] running")),
		).toEqual([
			{
				kind: "report",
				key: expect.stringMatching(/^report:s-77:/),
				workspaceId: WORKSPACE,
				sessionId: "s-77",
				text: "",
			},
		]);
		expect(
			reportCardsFromTool(
				claudeTool(
					`superset sessions list --workspace ${WORKSPACE}`,
					"[agent] x",
				),
			),
		).toEqual([]);
	});
});
