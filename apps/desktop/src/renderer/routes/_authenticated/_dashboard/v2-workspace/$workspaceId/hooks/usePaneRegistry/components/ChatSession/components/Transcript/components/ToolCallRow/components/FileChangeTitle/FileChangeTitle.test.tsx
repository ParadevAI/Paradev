import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { ToolCall } from "@superset/chat/protocol";
import { cleanup, render } from "@testing-library/react";
import { toolTitle, toolTitleText } from "../../../../utils/toolTitle";
import { collectHighlights } from "../../../../utils/transcriptHighlights";
import { FileChangeTitle } from "./FileChangeTitle";

// File icons resolve against the page URL, and the test DOM starts on about:blank.
const page = (
	window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM;
beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));
afterEach(cleanup);

const item: ToolCall = {
	id: "tool",
	kind: "tool_call",
	startedAtMs: 0,
	title: "Edit",
	toolKind: "edit",
	toolName: "edit",
	status: "completed",
	content: [
		{
			type: "diff",
			path: "/project/login.ts",
			oldText: "a\nb\n",
			newText: "a\nc\n",
		},
	],
};

test("find highlights the indexed title and skips the diff stats", () => {
	const { change, label } = toolTitle(item);
	if (!change) throw new Error("expected a file change");
	const view = render(
		<span data-find-item={item.id}>
			<FileChangeTitle
				change={change}
				item={item}
				running={false}
				verb={label}
			/>
		</span>,
	);
	expect(view.container.textContent).toContain("+1");
	const indexed = toolTitleText(item).toLowerCase();
	expect(collectHighlights(view.container, indexed, null).ranges).toHaveLength(
		1,
	);
	expect(collectHighlights(view.container, "1", null).ranges).toEqual([]);
});
