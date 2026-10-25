import { afterEach, expect, jest, mock, test } from "bun:test";
import {
	derivePendingApprovals,
	emptySnapshot,
	reduce,
	type SessionSnapshot,
} from "@superset/chat/core";
import type {
	ApprovalRequest,
	BackgroundTask,
	DeltaEnvelope,
	Item,
	ToolCall,
	UserMessage,
} from "@superset/chat/protocol";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type ComponentProps, useRef } from "react";
import { useDrawerEntry } from "../Composer/hooks/useDrawerEntry";
import type { DrawerQueue, WorkDrawerHandle } from "./types";
import { WorkDrawer } from "./WorkDrawer";

afterEach(() => {
	cleanup();
	jest.useRealTimers();
});

const exploreTask: BackgroundTask = {
	id: "subagent:c1",
	kind: "subagent",
	name: "",
	canStop: true,
	startedAtMs: 0,
};

const exploreItem: ToolCall = {
	id: "subagent:c1",
	kind: "tool_call",
	title: "Explore",
	toolKind: "think",
	toolName: "subagent",
	status: "running",
	content: [],
	startedAtMs: 0,
	subagent: true,
	subagentStatus: "running",
	canStop: true,
	canBackground: true,
};

const shell = (id: string, name: string): BackgroundTask => ({
	id,
	kind: "process",
	name,
	canStop: true,
	startedAtMs: 0,
});

const prompt = (id: string, text: string): UserMessage => ({
	id,
	kind: "user_message",
	startedAtMs: 0,
	queued: true,
	content: [{ type: "text", text }],
});

function snapshotOf(items: Item[]): SessionSnapshot {
	return {
		...emptySnapshot(),
		items: new Map(items.map((item) => [item.id, { item, turnId: "t1" }])),
	};
}

function queueOf(prompts: UserMessage[]): DrawerQueue {
	return {
		prompts,
		paused: false,
		actionable: true,
		remove: mock(async (_id: string) => {}),
		resume: mock(async () => {}),
		steer: mock(async (_id: string) => {}),
	};
}

type DrawerProps = ComponentProps<typeof WorkDrawer>;

function renderDrawer({
	tasks = [],
	items = [exploreItem],
	queue,
	...rest
}: {
	tasks?: BackgroundTask[];
	items?: Item[];
	queue?: DrawerQueue;
} & Partial<DrawerProps> = {}) {
	const handlers = {
		onOpenSubagent: mock((_itemId: string) => {}),
		onStop: mock((_taskId: string) => {}),
		onMoveToBackground: mock((_taskId: string) => {}),
		onExit: mock(() => {}),
		onAppendToComposer: mock((_text: string) => {}),
	};
	const snapshot = snapshotOf(items);
	const view = render(
		<WorkDrawer
			approvals={derivePendingApprovals(snapshot)}
			queue={queue}
			snapshot={snapshot}
			tasks={tasks}
			{...handlers}
			{...rest}
		/>,
	);
	return { view, ...handlers };
}

const rowNames = (view: ReturnType<typeof render>) =>
	view
		.getAllByRole("option")
		.map((row) => row.getAttribute("aria-label")?.split(", ")[0]);

const stops = (view: ReturnType<typeof render>) => [
	...view.container.querySelectorAll<HTMLElement>("[data-drawer-stop]"),
];

test("queued and running share one drawer", () => {
	const { view } = renderDrawer({
		queue: queueOf([
			prompt("q1", "What is the status?"),
			prompt("q2", "And the next step?"),
		]),
		tasks: [exploreTask, shell("task-1", "bun dev")],
	});
	const drawers = view.container.querySelectorAll("[data-work-drawer]");
	expect(drawers).toHaveLength(1);
	expect(view.getByRole("button", { name: /^Queued 2/ })).toBeTruthy();
	expect(view.getByRole("button", { name: /^Running 2/ })).toBeTruthy();
	expect(rowNames(view)).toEqual([
		"What is the status?",
		"And the next step?",
		"Explore",
		"bun dev",
	]);
});

test("an empty section is omitted and an empty drawer is hidden", () => {
	const onlyRunning = renderDrawer({ tasks: [shell("task-1", "bun dev")] });
	expect(onlyRunning.view.queryByRole("button", { name: /Queued/ })).toBeNull();
	cleanup();
	const onlyQueued = renderDrawer({ queue: queueOf([prompt("q1", "next")]) });
	expect(
		onlyQueued.view.queryByRole("button", { name: /^Queued \d/ }),
	).toBeNull();
	expect(rowNames(onlyQueued.view)).toEqual(["next"]);
	expect(onlyQueued.view.queryByRole("button", { name: /Running/ })).toBeNull();
	cleanup();
	const idle = renderDrawer({
		queue: queueOf([]),
		tasks: [exploreTask],
		items: [{ ...exploreItem, subagentStatus: "idle", status: "completed" }],
	});
	expect(idle.view.container.textContent).toBe("");
});

test("elapsed time ticks", () => {
	jest.useFakeTimers();
	let clock = 0;
	const { view } = renderDrawer({
		tasks: [shell("task-1", "bun dev")],
		now: () => clock,
	});
	expect(view.container.textContent).toContain("0s");
	clock = 45_000;
	act(() => jest.advanceTimersByTime(1000));
	expect(view.container.textContent).toContain("45s");
	clock = 61_000;
	act(() => jest.advanceTimersByTime(1000));
	expect(view.container.textContent).toContain("1m");
});

test("a running subagent shows its current step", () => {
	const snapshot = reduce(snapshotOf([exploreItem]), {
		v: 1,
		sessionId: "s1",
		ts: 1,
		delta: { type: "background", itemId: "subagent:c1", append: "sleep 8" },
	} as DeltaEnvelope);
	const { view } = renderDrawer({ tasks: [exploreTask], snapshot });
	expect(view.container.textContent).toContain("sleep 8");
	cleanup();
	const fromList = renderDrawer({
		tasks: [{ ...exploreTask, detail: "find . | wc -l" }],
	});
	expect(fromList.view.container.textContent).toContain("find . | wc -l");
});

test("a subagent's running subagents fold into its row", () => {
	const inner = (n: number): ToolCall => ({
		...exploreItem,
		id: `subagent:i${n}`,
		title: `inner-${n}`,
		parentItemId: "subagent:c1",
	});
	const { view } = renderDrawer({
		tasks: [
			{ ...exploreTask, detail: "Subagent: inner-2" },
			{ ...exploreTask, id: "subagent:i1" },
			{ ...exploreTask, id: "subagent:i2" },
		],
		items: [exploreItem, inner(1), inner(2)],
	});
	const rows = view.getAllByRole("option");
	expect(rows).toHaveLength(1);
	expect(rows[0]?.textContent).toContain("+2");
	expect(rows[0]?.textContent).toContain("waiting on 2 subagents");
	expect(rows[0]?.textContent).not.toContain("inner-2");
});

test("the drawer caps its height and scrolls", () => {
	const paneRef: { current: HTMLDivElement | null } = { current: null };
	const attachPane = (node: HTMLDivElement | null) => {
		if (node)
			Object.defineProperty(node, "clientHeight", {
				value: 600,
				configurable: true,
			});
		paneRef.current = node;
	};
	const view = render(
		<div ref={attachPane}>
			<WorkDrawer
				onAppendToComposer={() => {}}
				onExit={() => {}}
				onMoveToBackground={() => {}}
				onOpenSubagent={() => {}}
				onStop={() => {}}
				paneRef={paneRef}
				snapshot={snapshotOf([])}
				tasks={Array.from({ length: 10 }, (_, index) =>
					shell(`task-${index}`, `job ${index}`),
				)}
			/>
		</div>,
	);
	const scroller = view.container.querySelector<HTMLElement>(
		"[data-work-drawer-scroller]",
	);
	expect(scroller?.className).toContain("overflow-y-auto");
	expect(scroller?.style.maxHeight).toBe("min(13.5rem, 200px)");
	expect(view.getAllByRole("option")).toHaveLength(10);
	const header = view.getByRole("button", { name: /^Running 10/ });
	expect(header.className).toContain("sticky");
});

test("a section collapses", () => {
	const { view } = renderDrawer({
		queue: queueOf([prompt("q1", "next"), prompt("q2", "after")]),
		tasks: [shell("task-1", "bun dev")],
	});
	const header = view.getByRole("button", { name: /^Queued 2/ });
	expect(header.getAttribute("aria-expanded")).toBe("true");
	fireEvent.click(header);
	expect(header.getAttribute("aria-expanded")).toBe("false");
	expect(rowNames(view)).toEqual(["bun dev"]);
	fireEvent.click(header);
	expect(rowNames(view)).toEqual(["next", "after", "bun dev"]);
});

test("a collapsed running section summarizes its rows", () => {
	const { view } = renderDrawer({
		tasks: [exploreTask, shell("task-1", "bun dev")],
	});
	const header = view.getByRole("button", { name: /^Running 2/ });
	expect(header.textContent).not.toContain("1 shell");
	fireEvent.click(header);
	expect(header.textContent).toContain("1 subagent · 1 shell");
});

test("arrow keys move across both sections", () => {
	const { view, onExit } = renderDrawer({
		queue: queueOf([prompt("q1", "first"), prompt("q2", "second")]),
		tasks: [exploreTask, shell("task-1", "bun dev")],
	});
	const [queuedHeader, first, second, runningHeader, explore] = stops(view);
	act(() => explore?.focus());
	fireEvent.keyDown(explore as HTMLElement, { key: "ArrowUp" });
	expect(document.activeElement).toBe(runningHeader as HTMLElement);
	fireEvent.keyDown(runningHeader as HTMLElement, { key: "ArrowUp" });
	expect(document.activeElement).toBe(second as HTMLElement);
	fireEvent.keyDown(second as HTMLElement, { key: "ArrowUp" });
	fireEvent.keyDown(first as HTMLElement, { key: "ArrowUp" });
	expect(document.activeElement).toBe(queuedHeader as HTMLElement);
	fireEvent.keyDown(queuedHeader as HTMLElement, { key: "ArrowDown" });
	expect(document.activeElement).toBe(first as HTMLElement);
	expect(first?.getAttribute("tabindex")).toBe("0");
	expect(second?.getAttribute("tabindex")).toBe("-1");
	const last = stops(view).at(-1) as HTMLElement;
	act(() => last.focus());
	fireEvent.keyDown(last, { key: "ArrowDown" });
	expect(onExit).toHaveBeenCalledWith("composer");
});

test("arrow up on the top of the drawer goes on to the prompt history", () => {
	const { view, onExit } = renderDrawer({
		queue: queueOf([prompt("q1", "first")]),
	});
	const [header] = stops(view);
	act(() => header?.focus());
	fireEvent.keyDown(header as HTMLElement, { key: "ArrowUp" });
	expect(onExit).toHaveBeenCalledWith("history");
});

test("a section header toggles with Enter and Space and keeps focus in the drawer", () => {
	const { view, onExit } = renderDrawer({
		tasks: [shell("task-1", "bun dev")],
	});
	const header = view.getByRole("button", { name: /^Running 1/ });
	const row = view.getByRole("option");
	act(() => row.focus());
	fireEvent.click(header);
	expect(header.getAttribute("aria-expanded")).toBe("false");
	expect(document.activeElement).toBe(header);
	fireEvent.keyDown(header, { key: "Enter" });
	expect(header.getAttribute("aria-expanded")).toBe("true");
	fireEvent.keyDown(header, { key: " " });
	expect(header.getAttribute("aria-expanded")).toBe("false");
	fireEvent.keyDown(header, { key: "ArrowDown" });
	expect(onExit).toHaveBeenCalledWith("composer");
});

test("collapsing a section with the focused row moves focus to its header", () => {
	const { view } = renderDrawer({ tasks: [shell("task-1", "bun dev")] });
	const header = view.getByRole("button", { name: /^Running 1/ });
	const row = view.getByRole("option");
	act(() => row.focus());
	act(() => {
		header.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	expect(document.activeElement).toBe(header);
});

test("a row removed after focus left the drawer does not pull focus back", () => {
	const props = {
		onAppendToComposer: () => {},
		onExit: mock((_exit: string) => {}),
		onMoveToBackground: () => {},
		onOpenSubagent: () => {},
		onStop: () => {},
		snapshot: snapshotOf([]),
	};
	const view = render(
		<WorkDrawer
			{...props}
			tasks={[shell("task-1", "one"), shell("task-2", "two")]}
		/>,
	);
	const [first] = view.getAllByRole("option");
	act(() => first?.focus());
	act(() => first?.blur());
	expect(document.activeElement).toBe(document.body);
	view.rerender(<WorkDrawer {...props} tasks={[shell("task-2", "two")]} />);
	expect(document.activeElement).toBe(document.body);
	expect(props.onExit).not.toHaveBeenCalled();
});

test("a row removed while focused hands focus to its neighbour", () => {
	const props = {
		onAppendToComposer: () => {},
		onExit: () => {},
		onMoveToBackground: () => {},
		onOpenSubagent: () => {},
		onStop: () => {},
		snapshot: snapshotOf([]),
	};
	const view = render(
		<WorkDrawer
			{...props}
			tasks={[shell("task-1", "one"), shell("task-2", "two")]}
		/>,
	);
	const [first] = view.getAllByRole("option");
	act(() => first?.focus());
	view.rerender(<WorkDrawer {...props} tasks={[shell("task-2", "two")]} />);
	expect(document.activeElement).toBe(view.getByRole("option"));
});

test("removing the first of two queued prompts hands focus to the other", () => {
	const props = {
		onAppendToComposer: () => {},
		onExit: () => {},
		onMoveToBackground: () => {},
		onOpenSubagent: () => {},
		onStop: () => {},
		snapshot: snapshotOf([]),
		tasks: [shell("task-1", "bun dev")],
	};
	const second = prompt("q2", "second");
	const view = render(
		<WorkDrawer {...props} queue={queueOf([prompt("q1", "first"), second])} />,
	);
	const [first] = view.getAllByRole("option");
	act(() => first?.focus());
	view.rerender(<WorkDrawer {...props} queue={queueOf([second])} />);
	expect((document.activeElement as HTMLElement).dataset.drawerStop).toBe(
		"queued:q2",
	);
});

test("a focused collapsed queue header hands focus to the prompt left behind", () => {
	const props = {
		onAppendToComposer: () => {},
		onExit: () => {},
		onMoveToBackground: () => {},
		onOpenSubagent: () => {},
		onStop: () => {},
		snapshot: snapshotOf([]),
		tasks: [shell("task-1", "bun dev")],
	};
	const second = prompt("q2", "second");
	const view = render(
		<WorkDrawer {...props} queue={queueOf([prompt("q1", "first"), second])} />,
	);
	const header = view.getByRole("button", { name: /^Queued 2/ });
	act(() => header.focus());
	fireEvent.click(header);
	view.rerender(<WorkDrawer {...props} queue={queueOf([second])} />);
	expect((document.activeElement as HTMLElement).dataset.drawerStop).toBe(
		"queued:q2",
	);
});

test("a queue collapsed at two prompts opens again after it drops to one", () => {
	const props = {
		onAppendToComposer: () => {},
		onExit: () => {},
		onMoveToBackground: () => {},
		onOpenSubagent: () => {},
		onStop: () => {},
		snapshot: snapshotOf([]),
		tasks: [],
	};
	const first = prompt("q1", "first");
	const view = render(
		<WorkDrawer {...props} queue={queueOf([first, prompt("q2", "second")])} />,
	);
	fireEvent.click(view.getByRole("button", { name: /^Queued 2/ }));
	view.rerender(<WorkDrawer {...props} queue={queueOf([first])} />);
	expect(view.queryByRole("button", { name: /^Queued \d/ })).toBeNull();
	expect(stops(view).map((stop) => stop.dataset.drawerStop)).toEqual([
		"queued:q1",
	]);
	view.rerender(
		<WorkDrawer {...props} queue={queueOf([first, prompt("q3", "third")])} />,
	);
	expect(
		view
			.getByRole("button", { name: /^Queued 2/ })
			.getAttribute("aria-expanded"),
	).toBe("true");
	expect(rowNames(view)).toEqual(["first", "third"]);
});

test("a running row's accessible name carries its step, approval and time", () => {
	jest.useFakeTimers();
	const approval: ApprovalRequest = {
		id: "approval:1",
		kind: "approval_request",
		targetItemId: "sub:c1:bash-1",
		parentItemId: "subagent:c1",
		title: "Allow Bash?",
		status: "pending",
		startedAtMs: 3,
	};
	const { view } = renderDrawer({
		tasks: [{ ...exploreTask, detail: "sleep 10" }],
		items: [exploreItem, approval],
		now: () => 45_000,
	});
	expect(view.getByRole("option").getAttribute("aria-label")).toBe(
		"Explore, sleep 10, needs approval, 45s",
	);
});

test("enter steers a queued prompt and opens a subagent", () => {
	const queue = queueOf([prompt("q1", "first")]);
	const { view, onOpenSubagent, onExit } = renderDrawer({
		queue,
		tasks: [exploreTask, shell("task-1", "bun dev")],
	});
	const [queued, subagent, shellRow] = view.getAllByRole("option");
	fireEvent.keyDown(queued as HTMLElement, { key: "Enter" });
	expect(queue.steer).toHaveBeenCalledWith("q1");
	expect(onExit).toHaveBeenCalledWith("composer");
	fireEvent.keyDown(subagent as HTMLElement, { key: "Enter" });
	expect(onOpenSubagent).toHaveBeenCalledWith("subagent:c1");
	expect(onExit).toHaveBeenCalledTimes(2);
	fireEvent.keyDown(shellRow as HTMLElement, { key: "Enter" });
	expect(onOpenSubagent).toHaveBeenCalledTimes(1);
	expect(onExit).toHaveBeenCalledTimes(2);
});

test("backspace removes a queued prompt and stops a running shell", () => {
	const queue = queueOf([prompt("q1", "first")]);
	const { view, onStop } = renderDrawer({
		queue,
		tasks: [
			shell("task-1", "bun dev"),
			{ ...shell("task-2", "pinned"), canStop: false },
		],
	});
	const [queued, shellRow, pinned] = view.getAllByRole("option");
	fireEvent.keyDown(queued as HTMLElement, { key: "Backspace" });
	expect(queue.remove).toHaveBeenCalledWith("q1");
	fireEvent.keyDown(shellRow as HTMLElement, { key: "Delete" });
	expect(onStop).toHaveBeenCalledWith("task-1");
	fireEvent.keyDown(pinned as HTMLElement, { key: "Backspace" });
	expect(onStop).toHaveBeenCalledTimes(1);
});

function ComposerWithDrawer({
	drawerProps,
	recallHistory,
}: {
	drawerProps: Omit<DrawerProps, "onExit" | "ref">;
	recallHistory: () => void;
}) {
	const drawerRef = useRef<WorkDrawerHandle>(null);
	const editorRef = useRef<HTMLDivElement>(null);
	const entry = useDrawerEntry({
		enterDrawer: (options) => drawerRef.current?.focusLast(options) ?? false,
		focusComposer: () => editorRef.current?.focus(),
		recallHistory,
	});
	return (
		<div onKeyDownCapture={entry.onKeyDownCapture}>
			<WorkDrawer
				{...drawerProps}
				onExit={(exit) => entry.returnFocus(exit === "history")}
				ref={drawerRef}
			/>
			<div
				className="prompt-input-editor"
				contentEditable
				ref={editorRef}
				suppressContentEditableWarning
			>
				hello
			</div>
		</div>
	);
}

function renderComposer(drawer: Partial<DrawerProps> = {}) {
	const recallHistory = mock(() => {});
	const view = render(
		<ComposerWithDrawer
			recallHistory={recallHistory}
			drawerProps={{
				onAppendToComposer: () => {},
				onMoveToBackground: () => {},
				onOpenSubagent: () => {},
				onStop: () => {},
				snapshot: snapshotOf([exploreItem]),
				tasks: [exploreTask, shell("task-1", "bun dev")],
				queue: queueOf([prompt("q1", "first")]),
				...drawer,
			}}
		/>,
	);
	const editor = view.container.querySelector(
		".prompt-input-editor",
	) as HTMLElement;
	const placeCaret = (offset: number) => {
		act(() => editor.focus());
		const text = editor.firstChild as Text;
		const range = document.createRange();
		range.setStart(text, offset);
		range.collapse(true);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	};
	return { view, editor, placeCaret, recallHistory };
}

test("arrow up from the composer enters the drawer", () => {
	const { view, editor, placeCaret } = renderComposer();
	placeCaret(3);
	fireEvent.keyDown(editor, { key: "ArrowUp" });
	expect(document.activeElement).toBe(editor);
	placeCaret(0);
	const event = fireEvent.keyDown(editor, { key: "ArrowUp" });
	expect(event).toBe(false);
	const rows = view.getAllByRole("option");
	expect(document.activeElement).toBe(rows.at(-1) as HTMLElement);
});

test("arrow up leaves the composer alone when the drawer is empty", () => {
	const { editor, placeCaret } = renderComposer({
		tasks: [],
		queue: undefined,
	});
	placeCaret(0);
	expect(fireEvent.keyDown(editor, { key: "ArrowUp" })).toBe(true);
	expect(document.activeElement).toBe(editor);
});

test("escape returns to the composer", () => {
	const { view, editor, placeCaret } = renderComposer();
	placeCaret(0);
	fireEvent.keyDown(editor, { key: "ArrowUp" });
	const rows = view.getAllByRole("option");
	fireEvent.keyDown(rows.at(-1) as HTMLElement, { key: "ArrowUp" });
	fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
	expect(document.activeElement).toBe(editor);
	const range = window.getSelection()?.getRangeAt(0);
	expect(range?.startContainer).toBe(editor.firstChild as Node);
	expect(range?.startOffset).toBe(0);
});

test("arrow up past the top of the drawer recalls the previous prompt", () => {
	const { view, editor, placeCaret, recallHistory } = renderComposer();
	placeCaret(0);
	fireEvent.keyDown(editor, { key: "ArrowUp" });
	for (let step = 0; step < stops(view).length; step++)
		fireEvent.keyDown(document.activeElement as HTMLElement, {
			key: "ArrowUp",
		});
	expect(document.activeElement).toBe(editor);
	expect(recallHistory).toHaveBeenCalledTimes(1);
});

test("shift tab enters the drawer only when a row has an action", () => {
	const inert = renderComposer({
		queue: { ...queueOf([prompt("q1", "first")]), actionable: false },
		tasks: [{ ...shell("task-1", "pinned"), canStop: false }],
	});
	inert.placeCaret(0);
	expect(fireEvent.keyDown(inert.editor, { key: "Tab", shiftKey: true })).toBe(
		true,
	);
	expect(document.activeElement).toBe(inert.editor);
	cleanup();
	const live = renderComposer();
	live.placeCaret(0);
	fireEvent.keyDown(live.editor, { key: "Tab", shiftKey: true });
	expect(document.activeElement).toBe(
		live.view.getAllByRole("option").at(-1) as HTMLElement,
	);
});

test("clicking a subagent row opens it", () => {
	const { view, onOpenSubagent } = renderDrawer({ tasks: [exploreTask] });
	fireEvent.click(view.getByRole("option", { name: /^Explore/ }));
	expect(onOpenSubagent).toHaveBeenCalledWith("subagent:c1");
});

test("stop on a shell row stops it", () => {
	const { view, onStop } = renderDrawer({
		tasks: [shell("task-1", "bun dev")],
	});
	fireEvent.click(view.getByRole("button", { name: "Stop bun dev" }));
	expect(onStop).toHaveBeenCalledWith("task-1");
});

test("move to background shows only when canBackground", () => {
	const { view, onMoveToBackground } = renderDrawer({ tasks: [exploreTask] });
	fireEvent.click(
		view.getByRole("button", { name: "Move Explore to background" }),
	);
	expect(onMoveToBackground).toHaveBeenCalledWith("subagent:c1");
	cleanup();
	const pinned = renderDrawer({
		tasks: [exploreTask],
		items: [{ ...exploreItem, canBackground: false }],
	});
	expect(
		pinned.view.queryByRole("button", { name: "Move Explore to background" }),
	).toBeNull();
});

test("a subagent waiting on an approval says so", () => {
	const approval: ApprovalRequest = {
		id: "approval:sub:c1:bash-1",
		kind: "approval_request",
		targetItemId: "sub:c1:bash-1",
		parentItemId: "subagent:c1",
		title: "Allow Bash?",
		status: "pending",
		startedAtMs: 3,
	};
	const { view } = renderDrawer({
		tasks: [exploreTask],
		items: [exploreItem, approval],
	});
	expect(view.container.textContent).toContain("needs approval");
	cleanup();
	const answered = renderDrawer({
		tasks: [exploreTask],
		items: [exploreItem, { ...approval, status: "answered" }],
	});
	expect(answered.view.container.textContent).not.toContain("needs approval");
});

test("a folded subagent's approval flags the row it folds into", () => {
	const inner: ToolCall = {
		...exploreItem,
		id: "subagent:i1",
		title: "inner",
		parentItemId: "subagent:c1",
	};
	const approval: ApprovalRequest = {
		id: "approval:sub:i1:bash-1",
		kind: "approval_request",
		targetItemId: "sub:i1:bash-1",
		parentItemId: "subagent:i1",
		title: "Allow Bash?",
		status: "pending",
		startedAtMs: 3,
	};
	const { view } = renderDrawer({
		tasks: [exploreTask, { ...exploreTask, id: "subagent:i1" }],
		items: [exploreItem, inner, approval],
	});
	const rows = view.getAllByRole("option");
	expect(rows).toHaveLength(1);
	expect(rows[0]?.getAttribute("aria-label")).toContain("needs approval");
	const header = view.getByRole("button", { name: /^Running 1/ });
	fireEvent.click(header);
	expect(header.textContent).toContain("1 needs approval");
});
