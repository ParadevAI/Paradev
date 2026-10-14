import { expect, test } from "bun:test";
import type { ToolCall } from "@superset/chat/protocol";
import { toolTitle, toolTitleText } from "./toolTitle";

const tool: ToolCall = {
	id: "tool",
	kind: "tool_call",
	startedAtMs: 0,
	title: "Edit",
	toolKind: "edit",
	toolName: "edit",
	status: "completed",
	content: [
		{ type: "diff", path: "/project/login.ts", oldText: "old", newText: "new" },
	],
};

test("search and display share the translated file change label", () => {
	const translate = () => "Modifié";
	const title = toolTitle(tool, translate);
	expect(title.label).toBe("Modifié");
	expect(toolTitleText(tool, translate)).toBe(
		`${title.label} ${title.change?.name}`,
	);
});

test("a running terminal uses its displayed label", () => {
	expect(
		toolTitleText({
			...tool,
			title: "Terminal",
			toolKind: "execute",
			status: "running",
			content: [],
		}),
	).toBe("Running");
});

test("an installed plugin uses its displayed tool name", () => {
	const mcp: ToolCall = {
		...tool,
		title: "mcp__github__search",
		content: [],
		mcpServer: { name: "github", tool: "search" },
	};
	expect(toolTitleText(mcp, undefined, true)).toBe("search");
	expect(toolTitleText(mcp)).toBe("mcp__github__search");
});
