import { describe, expect, test } from "bun:test";
import type { Item } from "@superset/chat/protocol";
import { searchTextForItem, splitSearchQuery } from "./searchText";

describe("searchTextForItem", () => {
	test("keeps what the user typed, without hidden context or attachment tags", () => {
		const item = {
			id: "u",
			kind: "user_message",
			startedAtMs: 0,
			content: [
				{ type: "text", text: "<superset-context>secret</superset-context>" },
				{
					type: "text",
					text: 'Fix the upload <attachment path=".superset/attachments/a.png" />',
				},
				{ type: "text", text: "hidden part", hidden: true },
			],
		} as Item;
		expect(searchTextForItem(item)).toBe("Fix the upload");
	});

	test("indexes a tool call by its title only", () => {
		const item = {
			id: "t",
			kind: "tool_call",
			title: "Read acpAdapter.ts",
			toolKind: "read",
			toolName: "Read",
			status: "completed",
			content: [{ type: "content", content: { type: "text", text: "body" } }],
			startedAtMs: 0,
		} as Item;
		expect(searchTextForItem(item)).toBe("Read acpAdapter.ts");
	});

	test("reads nothing from a known kind with the wrong shape", () => {
		for (const kind of ["user_message", "agent_message", "tool_call"]) {
			expect(searchTextForItem({ id: "x", kind, startedAtMs: 0 } as Item)).toBe(
				"",
			);
		}
	});
});

describe("splitSearchQuery", () => {
	test("splits code names the way the index does", () => {
		expect(splitSearchQuery("prepareClaudeSession acpAdapter.ts")).toBe(
			"prepare Claude Session acp Adapter ts",
		);
	});
});
