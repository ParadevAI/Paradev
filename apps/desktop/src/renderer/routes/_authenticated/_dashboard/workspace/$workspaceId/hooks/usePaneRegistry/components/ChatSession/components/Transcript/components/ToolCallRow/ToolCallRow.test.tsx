import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { ToolCall } from "@superset/chat/protocol";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ToolCallRow } from "./ToolCallRow";

// File icons resolve against the page URL, and the test DOM starts on about:blank.
const page = (
	window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM;
beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));
afterEach(cleanup);

function shellCall(
	command: string,
	content: ToolCall["content"] = [],
): ToolCall {
	return {
		id: "call-1",
		kind: "tool_call",
		title: command,
		toolKind: "execute",
		toolName: "Bash",
		status: "completed",
		startedAtMs: 1,
		rawInput: { command },
		content,
	};
}

test("a shell read shown as a read keeps its command in the body, even with no output", () => {
	const command = "/bin/zsh -lc 'cat package.json'";
	const view = render(<ToolCallRow item={shellCall(command)} />);
	expect(view.container.textContent).not.toContain("$ cat package.json");
	fireEvent.click(view.getByRole("button", { name: command }));
	expect(view.container.textContent).toContain("$ cat package.json");
});

test("a terminal block that prints the command is not repeated", () => {
	const view = render(
		<ToolCallRow
			item={shellCall("cat package.json", [
				{ type: "terminal", command: "cat package.json", output: "{}" },
			])}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "cat package.json" }));
	expect(
		view.container.textContent?.match(/\$ cat package\.json/g),
	).toHaveLength(1);
});

test("a created Paradev task shows its label and a chip for the task", () => {
	const view = render(
		<ToolCallRow
			item={{
				id: "call-2",
				kind: "tool_call",
				title: "mcp__paradev__tasks_create",
				toolKind: "other",
				toolName: "mcp__paradev__tasks_create",
				status: "completed",
				startedAtMs: 1,
				content: [],
				rawOutput: { structuredContent: { task: { title: "Fix login" } } },
				mcpServer: { name: "paradev", tool: "tasks_create" },
			}}
		/>,
	);
	expect(view.container.textContent).toContain("Created task");
	expect(
		view.container.querySelector('[data-chip-kind="task"]')?.textContent,
	).toBe("Fix login");
});
