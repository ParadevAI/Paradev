import { afterEach, expect, test } from "bun:test";
import {
	deriveChildrenByParent,
	type SessionSnapshot,
} from "@superset/chat/core";
import type { ApprovalRequest, Item, ToolCall } from "@superset/chat/protocol";
import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
} from "@testing-library/react";
import { useState } from "react";
import { ChatPaneTitle } from "../../../../../ChatPaneTitle";
import { SubagentView } from "../../../SubagentView";
import { NestedToolCallRow } from "../../../Transcript/components/NestedToolCallRow";
import { NestedItemsProvider } from "../../../Transcript/providers/NestedItemsProvider";
import { useSubagentNavigation } from "./useSubagentNavigation";

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
	canSteer: true,
	canStop: true,
};

const approval: ApprovalRequest = {
	id: "approval:c1",
	kind: "approval_request",
	parentItemId: "subagent:c1",
	targetItemId: null,
	title: "Allow Bash: sleep 60?",
	status: "pending",
	startedAtMs: 3,
};

function itemsOf(items: readonly Item[]): SessionSnapshot["items"] {
	return new Map(items.map((item) => [item.id, { item, turnId: "t1" }]));
}

function snapshotOf(items: readonly Item[]): SessionSnapshot {
	return {
		session: { status: "running", harness: "acp", backgroundTasks: [] },
		turns: new Map(),
		items: itemsOf(items),
		liveStreams: new Map(),
		cursor: null,
		pendingReset: null,
	};
}

function ChatWithHeader({
	chatKey,
	snapshot,
}: {
	chatKey: string;
	snapshot: SessionSnapshot;
}) {
	const { focusedId, openSubagent } = useSubagentNavigation({
		chatKey,
		items: snapshot.items,
	});
	return (
		<>
			<ChatPaneTitle chatKey={chatKey} icon={null} isActive title="Chat" />
			<span data-testid="focused">{focusedId ?? "main"}</span>
			<NestedItemsProvider
				value={{
					snapshot,
					childrenByParent: deriveChildrenByParent(snapshot),
					requestItemBodies: () => {},
					respondToApproval: () => {},
					openSubagent,
				}}
			>
				<NestedToolCallRow item={task} />
			</NestedItemsProvider>
		</>
	);
}

test("clicking a line opens the subagent with a header breadcrumb", () => {
	const view = render(
		<ChatWithHeader
			chatKey="chat-open"
			snapshot={snapshotOf([task, readme])}
		/>,
	);
	expect(view.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
	expect(view.queryByText("task")).toBeNull();

	fireEvent.click(
		view.getByRole("button", { name: "Readme and wait started working" }),
	);

	expect(view.getByTestId("focused").textContent).toBe("subagent:c1");
	const breadcrumb = view.getByRole("navigation", { name: "Breadcrumb" });
	expect(breadcrumb.textContent).toBe("ChatReadme and wait");

	fireEvent.click(view.getByRole("button", { name: "Chat" }));
	expect(view.getByTestId("focused").textContent).toBe("main");
	expect(view.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
});

test("the open subagent survives a remount", () => {
	const hook = renderHook(
		({ items }: { items: SessionSnapshot["items"] }) =>
			useSubagentNavigation({ chatKey: "chat-approval", items }),
		{ initialProps: { items: itemsOf([task, readme, approval]) } },
	);
	act(() => hook.result.current.openSubagent("subagent:c1"));
	expect(hook.result.current.focusedId).toBe("subagent:c1");

	hook.unmount();
	const remounted = renderHook(
		({ items }: { items: SessionSnapshot["items"] }) =>
			useSubagentNavigation({ chatKey: "chat-approval", items }),
		{ initialProps: { items: itemsOf([]) } },
	);
	remounted.rerender({
		items: itemsOf([task, readme, { ...approval, status: "answered" }]),
	});
	expect(remounted.result.current.focusedId).toBe("subagent:c1");
});

test("a subagent that leaves the transcript stops being focused", () => {
	const hook = renderHook(
		({ items }: { items: SessionSnapshot["items"] }) =>
			useSubagentNavigation({ chatKey: "chat-stale", items }),
		{ initialProps: { items: itemsOf([task, readme]) } },
	);
	act(() => hook.result.current.openSubagent("subagent:c1"));
	hook.rerender({ items: itemsOf([task]) });
	expect(hook.result.current.focusedId).toBeNull();
	hook.rerender({ items: itemsOf([task, readme]) });
	expect(hook.result.current.focusedId).toBeNull();
});

function ChatWithApproval() {
	const [snapshot, setSnapshot] = useState(() =>
		snapshotOf([task, readme, approval]),
	);
	const { focusedId, openSubagent } = useSubagentNavigation({
		chatKey: "chat-approval-answer",
		items: snapshot.items,
	});
	const respond = () =>
		setSnapshot(
			snapshotOf([
				task,
				readme,
				{ ...approval, status: "answered", decision: { type: "accept" } },
			]),
		);
	return (
		<NestedItemsProvider
			value={{
				snapshot,
				childrenByParent: deriveChildrenByParent(snapshot),
				requestItemBodies: () => {},
				respondToApproval: respond,
				openSubagent,
			}}
		>
			<span data-testid="focused">{focusedId ?? "main"}</span>
			{focusedId ? (
				<SubagentView itemId={focusedId} />
			) : (
				<NestedToolCallRow item={task} />
			)}
		</NestedItemsProvider>
	);
}

test("answering an approval keeps the subagent open", () => {
	const view = render(<ChatWithApproval />);
	fireEvent.click(
		view.getByRole("button", { name: "Readme and wait started working" }),
	);
	fireEvent.click(view.getByRole("button", { name: "Allow" }));

	expect(view.queryByRole("button", { name: "Allow" })).toBeNull();
	expect(view.getByTestId("focused").textContent).toBe("subagent:c1");
});

test("going back opens the parent subagent, then the main chat", () => {
	const nested: ToolCall = {
		...readme,
		id: "subagent:c2",
		parentItemId: "subagent:c1",
		title: "Nested",
	};
	const hook = renderHook(() =>
		useSubagentNavigation({
			chatKey: "chat-back",
			items: itemsOf([task, readme, nested]),
		}),
	);
	act(() => hook.result.current.openSubagent("subagent:c2"));
	act(() => hook.result.current.goBack());
	expect(hook.result.current.focusedId).toBe("subagent:c1");
	act(() => hook.result.current.goBack());
	expect(hook.result.current.focusedId).toBeNull();
});
