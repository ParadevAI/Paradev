import { describe, expect, test } from "bun:test";
import { claudeTool } from "../toolText/toolText.test-data";
import { pullRequestCardsFromTool } from "./pullRequestCards";

describe("pullRequestCardsFromTool", () => {
	test("reads the pull request gh opened", () => {
		const output =
			"Creating pull request for shell-polish/tabs into main\nhttps://github.com/ParadevAI/paradev/pull/9401\n";
		expect(
			pullRequestCardsFromTool(
				claudeTool('gh pr create --title "Tabs" --body "…"', output),
			),
		).toEqual([
			{
				kind: "pull_request",
				key: "pr:paradevai/paradev#9401",
				url: "https://github.com/ParadevAI/paradev/pull/9401",
				repoFullName: "ParadevAI/paradev",
				number: 9401,
			},
		]);
	});

	test("reads each pull request an agent reported, once", () => {
		const output =
			"[agent] Opened https://github.com/ParadevAI/paradev/pull/9401 and https://github.com/ParadevAI/paradev/pull/9401/files, then https://github.com/ParadevAI/paradev/pull/9402.";
		expect(
			pullRequestCardsFromTool(
				claudeTool("superset sessions read --workspace x --session y", output),
			).map((card) => card.key),
		).toEqual(["pr:paradevai/paradev#9401", "pr:paradevai/paradev#9402"]);
	});

	test("ignores mentions in other commands", () => {
		expect(
			pullRequestCardsFromTool(
				claudeTool(
					"git log -1",
					"See https://github.com/ParadevAI/paradev/pull/9401",
				),
			),
		).toEqual([]);
	});
});
