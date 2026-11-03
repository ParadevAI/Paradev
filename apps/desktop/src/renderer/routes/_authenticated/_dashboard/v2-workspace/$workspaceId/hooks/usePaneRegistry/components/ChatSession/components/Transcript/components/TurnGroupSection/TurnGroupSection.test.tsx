import { afterEach, expect, mock, test } from "bun:test";
import {
	deriveChildrenByParent,
	deriveTimeline,
	type SessionSnapshot,
} from "@superset/chat/core";
import type {
	ApprovalRequest,
	Decision,
	Item,
	ToolCall,
} from "@superset/chat/protocol";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { pageLinkFinder } from "../../../../utils/pageLinks";
import { NestedItemsProvider } from "../../providers/NestedItemsProvider";
import { replyFooters } from "../../utils/replyFooters";
import { subagentLines } from "../../utils/subagentLines";
import { transcriptRows } from "../../utils/transcriptRows";
import { TurnGroupSection } from "./TurnGroupSection";

afterEach(cleanup);

function tool(id: string, startedAtMs: number): ToolCall {
	return {
		id,
		kind: "tool_call",
		title: `read ${id}.ts`,
		toolKind: "read",
		toolName: "read",
		status: "completed",
		content: [],
		startedAtMs,
	};
}

const task: ToolCall = {
	...tool("task-1", 3),
	title: "task",
	toolName: "task",
};

const readme: ToolCall = {
	...tool("subagent:c1", 4),
	parentItemId: "task-1",
	title: "Readme and wait",
	toolKind: "think",
	toolName: "subagent",
	subagent: true,
	subagentStatus: "idle",
};

function snapshotOf(items: readonly Item[], running = false): SessionSnapshot {
	return {
		session: {
			status: running ? "running" : "idle",
			harness: "acp",
			backgroundTasks: [],
		},
		turns: new Map([
			[
				"t1",
				running
					? { id: "t1", status: "running", startedAtMs: 0 }
					: { id: "t1", status: "completed", startedAtMs: 0, completedAtMs: 9 },
			],
		]),
		items: new Map(items.map((item) => [item.id, { item, turnId: "t1" }])),
		liveStreams: new Map(),
		cursor: null,
		pendingReset: null,
	};
}

function renderTranscript(
	snapshot: SessionSnapshot,
	onRespond: (approvalId: string, decision: Decision) => void = () => {},
) {
	const childrenByParent = deriveChildrenByParent(snapshot);
	const { rows, inlineReplyKeys } = replyFooters(
		transcriptRows(
			deriveTimeline(snapshot, { nestChildItems: true }),
			[],
			new Set(),
			pageLinkFinder("https://app.superset.sh"),
			new Set(),
			(each) => subagentLines(each, childrenByParent.get(each.id)) !== null,
		),
	);
	const view = render(
		<NestedItemsProvider
			value={{
				snapshot,
				childrenByParent,
				requestItemBodies: () => {},
				respondToApproval: onRespond,
				openSubagent: () => {},
			}}
		>
			{rows.map((row) => (
				<TurnGroupSection
					childrenByParent={childrenByParent}
					isEntryCollapsed={(_key, collapsed) => collapsed}
					key={row.key}
					lastReply={inlineReplyKeys.has(row.key)}
					onDiscardPrompt={() => {}}
					onRespond={onRespond}
					onRetryPrompt={() => {}}
					onToggleEntry={() => {}}
					row={row}
					snapshot={snapshot}
				/>
			))}
		</NestedItemsProvider>,
	);
	return { rows, view };
}

test("a subagent line stays visible in a turn whose tools collapse", () => {
	const { rows, view } = renderTranscript(
		snapshotOf([
			tool("a", 1),
			tool("b", 2),
			task,
			readme,
			tool("c", 5),
			tool("d", 6),
		]),
	);

	expect(
		view.getByRole("button", { name: "Readme and wait finished" }),
	).toBeTruthy();
	expect(view.container.textContent).not.toContain("read a.ts");
	expect(view.container.textContent).not.toContain("read c.ts");
	expect(rows.filter((row) => row.kind === "tool_run")).toHaveLength(2);
});

test("a subagent's pending approval shows in the main transcript and answers there", () => {
	const approval: ApprovalRequest = {
		id: "approval:sub:c1:bash-1",
		kind: "approval_request",
		targetItemId: "sub:c1:bash-1",
		parentItemId: "subagent:c1",
		title: "rm -rf build",
		status: "pending",
		startedAtMs: 5,
	};
	const onRespond = mock((_approvalId: string, _decision: Decision) => {});
	const { view } = renderTranscript(
		snapshotOf(
			[
				task,
				{ ...readme, status: "running", subagentStatus: "running" },
				approval,
			],
			true,
		),
		onRespond,
	);

	expect(view.container.textContent).toContain("Readme and wait asks");
	expect(view.container.textContent).toContain("rm -rf build");
	fireEvent.click(view.getByRole("button", { name: "Allow" }));
	expect(onRespond).toHaveBeenCalledWith("approval:sub:c1:bash-1", {
		type: "accept",
	});
});

test("a reply followed by tool calls shows its footer after them", () => {
	const reply: Item = {
		id: "reply-1",
		kind: "agent_message",
		text: "Done.",
		startedAtMs: 1,
		completedAtMs: 2,
	} as Item;
	const { view } = renderTranscript(
		snapshotOf([reply, tool("a", 3), tool("b", 4)]),
	);

	const copy = view.getByRole("button", { name: "Copy message" });
	const run = view.getByText("Done.");
	expect(
		run.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy();
	expect(view.container.lastElementChild?.contains(copy)).toBe(true);
});

test("a running turn's last tool run shows its last three steps while collapsed", () => {
	const { view } = renderTranscript(
		snapshotOf(
			[tool("a", 1), tool("b", 2), tool("c", 3), tool("d", 4), tool("e", 5)],
			true,
		),
	);

	expect(view.container.textContent).not.toContain("read a.ts");
	expect(view.container.textContent).not.toContain("read b.ts");
	for (const id of ["c", "d", "e"])
		expect(view.container.textContent).toContain(`read ${id}.ts`);
});
