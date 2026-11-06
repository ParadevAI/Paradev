import { describe, expect, test } from "bun:test";
import type { TranscriptCardRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { claudeTool, terminalTool } from "../toolText/toolText.test-data";
import { workspaceCardsFromTool } from "./workspaceCards";

const ID = "a94e7f3d-f144-4fee-9bee-c84e38765186";
const OUTPUT = `\`\`\`console
{
  "workspace": {
    "id": "${ID}",
    "name": "investigate-title-tabs",
    "branch": "shell-polish/investigate-title-tabs",
    "meta": { "nested": "{brace} in a string" }
  },
  "agents": [],
  "alreadyExists": false,
  "webUrl": "https://app.superset.sh/w/${ID}"
}
\`\`\``;

describe("workspaceCardsFromTool", () => {
	test("reads the workspace a create command printed, nested braces and all", () => {
		const expected: TranscriptCardRef[] = [
			{
				kind: "workspace",
				key: `workspace:${ID}`,
				workspaceId: ID,
				name: "investigate-title-tabs",
				branch: "shell-polish/investigate-title-tabs",
			},
		];
		const command = "superset workspaces create --local --name x --json 2>&1";
		expect(workspaceCardsFromTool(claudeTool(command, OUTPUT))).toEqual(
			expected,
		);
		expect(workspaceCardsFromTool(terminalTool(command, OUTPUT))).toEqual(
			expected,
		);
	});

	test("ignores listings and other commands", () => {
		expect(
			workspaceCardsFromTool(
				claudeTool("superset workspaces list --json", OUTPUT),
			),
		).toEqual([]);
		expect(workspaceCardsFromTool(claudeTool("git status", "clean"))).toEqual(
			[],
		);
	});

	test("skips output that is not a workspace", () => {
		expect(
			workspaceCardsFromTool(
				claudeTool("superset ws create --json", '{"workspace":{"id":"nope"}}'),
			),
		).toEqual([]);
	});
});
