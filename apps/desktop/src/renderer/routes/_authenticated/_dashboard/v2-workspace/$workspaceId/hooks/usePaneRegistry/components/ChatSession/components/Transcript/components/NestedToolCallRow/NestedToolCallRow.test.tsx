import { afterEach, expect, test } from "bun:test";
import {
	deriveChildrenByParent,
	type SessionSnapshot,
} from "@superset/chat/core";
import type { Item, ToolCall } from "@superset/chat/protocol";
import { cleanup, render } from "@testing-library/react";
import { NestedItemsProvider } from "../../providers/NestedItemsProvider";
import { NestedToolCallRow } from "./NestedToolCallRow";

afterEach(cleanup);

const task: ToolCall = {
	id: "task-1",
	kind: "tool_call",
	title: "task",
	toolKind: "other",
	toolName: "task",
	status: "running",
	content: [],
	startedAtMs: 1,
};

const readme: ToolCall = {
	id: "subagent:c1",
	kind: "tool_call",
	parentItemId: "task-1",
	title: "Readme and wait",
	toolKind: "think",
	toolName: "subagent",
	status: "running",
	content: [],
	startedAtMs: 2,
	subagent: true,
	subagentStatus: "running",
};

const grandchild: ToolCall = {
	id: "subagent:c2",
	kind: "tool_call",
	parentItemId: "subagent:c1",
	title: "Deeper",
	toolKind: "think",
	toolName: "subagent",
	status: "running",
	content: [],
	startedAtMs: 3,
	subagent: true,
};

function renderRow(items: readonly Item[], item: ToolCall = task) {
	const snapshot: SessionSnapshot = {
		session: { status: "running", harness: "acp", backgroundTasks: [] },
		turns: new Map(),
		items: new Map(
			items.map((each) => [each.id, { item: each, turnId: "t1" }]),
		),
		liveStreams: new Map(),
		cursor: null,
		pendingReset: null,
	};
	return render(
		<NestedItemsProvider
			value={{
				snapshot,
				childrenByParent: deriveChildrenByParent(snapshot),
				requestItemBodies: () => {},
				respondToApproval: () => {},
				openSubagent: () => {},
			}}
		>
			<NestedToolCallRow item={item} />
		</NestedItemsProvider>,
	);
}

test("a subagent shows as started and finished lines", () => {
	const running = renderRow([task, readme, grandchild]);
	expect(running.container.textContent).toBe("Readme and wait started working");
	cleanup();

	const finished = renderRow([
		{ ...task, status: "completed" },
		{ ...readme, status: "completed", subagentStatus: "idle" },
	]);
	expect(finished.container.textContent).toBe("Readme and wait finished");
	cleanup();

	const stopped = renderRow([
		task,
		{ ...readme, status: "canceled", subagentStatus: "stopped" },
	]);
	expect(stopped.container.textContent).toBe("Readme and wait stopped");
	cleanup();

	const {
		subagentStatus: _status,
		parentItemId: _parent,
		...claudeTask
	} = readme;
	const failed = renderRow([{ ...claudeTask, status: "failed" }], {
		...claudeTask,
		status: "failed",
	});
	expect(failed.container.textContent).toBe("Readme and wait failed");
});
