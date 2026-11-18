import { afterEach, expect, mock, test } from "bun:test";
import {
	deriveChildrenByParent,
	type SessionSnapshot,
} from "@superset/chat/core";
import type {
	AgentMessage,
	ApprovalRequest,
	Decision,
	Item,
	ToolCall,
	UserMessage,
} from "@superset/chat/protocol";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { NestedItemsProvider } from "../Transcript/providers/NestedItemsProvider";
import { TranscriptPluginsProvider } from "../Transcript/providers/TranscriptPluginsProvider";
import { SubagentView } from "./SubagentView";

afterEach(cleanup);

const explore: ToolCall = {
	id: "subagent:c1",
	kind: "tool_call",
	title: "Explore",
	toolKind: "think",
	toolName: "subagent",
	status: "running",
	content: [{ type: "text", text: "Find the file" }],
	startedAtMs: 1,
	subagent: true,
};

const reply: AgentMessage = {
	id: "sub:c1:agent_message:m1",
	kind: "agent_message",
	parentItemId: "subagent:c1",
	text: "Here is what I found",
	startedAtMs: 2,
};

const read: ToolCall = {
	id: "sub:c1:read-1",
	kind: "tool_call",
	parentItemId: "subagent:c1",
	title: "foo.ts",
	toolKind: "read",
	toolName: "read",
	status: "completed",
	content: [],
	startedAtMs: 3,
};

const steer: UserMessage = {
	id: "sub:c1:user_message:u1",
	kind: "user_message",
	parentItemId: "subagent:c1",
	content: [{ type: "text", text: "Skip the tests" }],
	startedAtMs: 4,
};

const nested: ToolCall = {
	id: "subagent:c2",
	kind: "tool_call",
	parentItemId: "subagent:c1",
	title: "Nested",
	toolKind: "think",
	toolName: "subagent",
	status: "running",
	content: [],
	startedAtMs: 5,
	subagent: true,
};

const nestedBrief: UserMessage = {
	id: "sub:c2:user_message:u1",
	kind: "user_message",
	parentItemId: "subagent:c2",
	from: "parent",
	content: [{ type: "text", text: "Check the docs" }],
	startedAtMs: 6,
};

function snapshotOf(items: readonly Item[]): SessionSnapshot {
	return {
		session: { status: "running", harness: "acp", backgroundTasks: [] },
		turns: new Map(),
		items: new Map(items.map((item) => [item.id, { item, turnId: "t1" }])),
		liveStreams: new Map(),
		cursor: null,
		pendingReset: null,
	};
}

function renderView(
	itemId = "subagent:c1",
	{
		items = [explore, reply, read, steer, nested, nestedBrief],
		onOpenSubagent = () => {},
		onRespond = () => {},
		plugins = [],
		queued = [],
	}: {
		queued?: ComponentProps<typeof SubagentView>["queued"];
		items?: readonly Item[];
		onOpenSubagent?: (itemId: string) => void;
		onRespond?: (approvalId: string, decision: Decision) => void;
		plugins?: { name: string; displayName: string; description: string }[];
	} = {},
) {
	const snapshot = snapshotOf(items);
	return render(
		<TranscriptPluginsProvider value={plugins}>
			<NestedItemsProvider
				value={{
					snapshot,
					childrenByParent: deriveChildrenByParent(snapshot),
					requestItemBodies: () => {},
					respondToApproval: onRespond,
					openSubagent: onOpenSubagent,
				}}
			>
				<SubagentView itemId={itemId} queued={queued} />
			</NestedItemsProvider>
		</TranscriptPluginsProvider>,
	);
}

test("shows the subagent's messages and tools", () => {
	const view = renderView();
	const text = view.container.textContent;
	expect(text).toContain("Find the file");
	expect(text).toContain("Here is what I found");
	expect(text).toContain("foo.ts");
	expect(text).toContain("Skip the tests");
	expect(text).not.toContain("Check the docs");
});

test("a nested subagent is an event line that drills deeper", () => {
	const onOpenSubagent = mock((_itemId: string) => {});
	const view = renderView("subagent:c1", { onOpenSubagent });
	fireEvent.click(view.getByRole("button", { name: "Nested started working" }));
	expect(onOpenSubagent).toHaveBeenCalledWith("subagent:c2");
});

test("a parent message is labelled with the parent", () => {
	const view = renderView("subagent:c2");
	const text = view.container.textContent;
	expect(text).toContain("from Explore");
	expect(text).toContain("Check the docs");
});

test("a pending approval in the drill-in answers there too", () => {
	const approval: ApprovalRequest = {
		id: "approval:sub:c1:read-1",
		kind: "approval_request",
		targetItemId: "sub:c1:read-1",
		parentItemId: "subagent:c1",
		title: "Read foo.ts?",
		status: "pending",
		startedAtMs: 7,
	};
	const onRespond = mock((_approvalId: string, _decision: Decision) => {});
	const view = renderView("subagent:c1", {
		items: [explore, read, approval],
		onRespond,
	});
	expect(view.container.textContent).toContain("Read foo.ts?");
	expect(view.container.textContent).not.toContain("Explore asks");
	fireEvent.click(view.getByRole("button", { name: "Allow" }));
	expect(onRespond).toHaveBeenCalledWith("approval:sub:c1:read-1", {
		type: "accept",
	});
});

test("a plugin tool call reads the installed plugin", () => {
	const listIssues: ToolCall = {
		...read,
		id: "sub:c1:mcp-1",
		title: "list_issues (linear)",
		toolKind: "other",
		toolName: "mcp",
		mcpServer: { name: "linear", tool: "list_issues" },
	};
	const view = renderView("subagent:c1", {
		items: [explore, listIssues],
		plugins: [{ name: "linear", displayName: "Linear", description: "" }],
	});
	expect(view.container.textContent).toContain("list_issues");
	expect(view.container.textContent).not.toContain("(linear)");
});

test("a message waiting for the subagent shows as queued at the bottom", () => {
	const view = renderView("subagent:c1", {
		queued: [
			{ id: "steer:1", content: [{ type: "text", text: "Also check docs" }] },
		],
	});
	const text = view.container.textContent ?? "";
	expect(text).toContain("Queued");
	expect(text.indexOf("Also check docs")).toBeGreaterThan(
		text.indexOf("Here is what I found"),
	);
});
