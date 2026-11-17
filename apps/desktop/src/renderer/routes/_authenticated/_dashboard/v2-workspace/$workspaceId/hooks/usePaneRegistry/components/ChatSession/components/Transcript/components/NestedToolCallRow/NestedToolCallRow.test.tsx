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

function renderRow(
	items: readonly Item[],
	item: ToolCall = task,
	liveTaskIds: readonly string[] = [],
) {
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
				liveTasks: new Map(
					liveTaskIds.map((id) => [
						id,
						{ id, kind: "subagent", name: id, canStop: false, startedAtMs: 1 },
					]),
				),
			}}
		>
			<NestedToolCallRow item={item} />
		</NestedItemsProvider>,
	);
}

function statusOf(view: ReturnType<typeof render>, id: string) {
	return view.container
		.querySelector(`[data-subagent-run="${id}"] [data-run-status]`)
		?.getAttribute("data-run-status");
}

test("a launcher's subagents show as run rows, a nested one under its parent", () => {
	const running = renderRow([task, readme, grandchild], task, [
		readme.id,
		grandchild.id,
	]);
	expect(running.container.textContent).toContain("Readme and wait");
	expect(statusOf(running, readme.id)).toBe("waiting");
	expect(statusOf(running, grandchild.id)).toBe("running");
	cleanup();

	const finished = renderRow([
		{ ...task, status: "completed" },
		{ ...readme, status: "completed", subagentStatus: "idle" },
	]);
	expect(statusOf(finished, readme.id)).toBe("finished");
	cleanup();

	const stopped = renderRow([
		task,
		{ ...readme, status: "canceled", subagentStatus: "stopped" },
	]);
	expect(statusOf(stopped, readme.id)).toBe("stopped");
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
	expect(statusOf(failed, readme.id)).toBe("failed");
});
