import { afterEach, expect, mock, test } from "bun:test";
import type { UserContent, UserMessage } from "@superset/chat/protocol";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type ComponentProps, useRef } from "react";
import { useDrawerEntry } from "../Composer/hooks/useDrawerEntry";
import type { DrawerQueue, WorkDrawerHandle } from "./types";
import { WorkDrawer } from "./WorkDrawer";

afterEach(cleanup);

const prompt = (id: string, text: string): UserMessage => ({
	id,
	kind: "user_message",
	startedAtMs: 0,
	queued: true,
	content: [{ type: "text", text }],
});

function queueOf(prompts: UserMessage[]): DrawerQueue {
	return {
		prompts,
		paused: false,
		actionable: true,
		remove: mock(async (_id: string) => {}),
		resume: mock(async () => {}),
		steer: mock(async (_id: string) => {}),
		update: mock(async (_id: string, _content: UserContent[]) => {}),
	};
}

type DrawerProps = ComponentProps<typeof WorkDrawer>;

function renderDrawer(props: Partial<DrawerProps> = {}) {
	const handlers = {
		onExit: mock((_exit: string) => {}),
	};
	const view = render(<WorkDrawer {...handlers} {...props} />);
	return { view, ...handlers };
}

const rowNames = (view: ReturnType<typeof render>) =>
	view
		.getAllByRole("option")
		.map((row) => row.getAttribute("aria-label")?.split(", ")[0]);

const stops = (view: ReturnType<typeof render>) => [
	...view.container.querySelectorAll<HTMLElement>("[data-drawer-stop]"),
];

test("an empty drawer is hidden and one prompt needs no header", () => {
	const empty = renderDrawer({ queue: queueOf([]) });
	expect(empty.view.container.textContent).toBe("");
	cleanup();
	const one = renderDrawer({ queue: queueOf([prompt("q1", "next")]) });
	expect(one.view.queryByRole("button", { name: /^Queued \d/ })).toBeNull();
	expect(rowNames(one.view)).toEqual(["next"]);
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
				onExit={() => {}}
				paneRef={paneRef}
				queue={queueOf(
					Array.from({ length: 10 }, (_, index) =>
						prompt(`q${index}`, `prompt ${index}`),
					),
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
	const header = view.getByRole("button", { name: /^Queued 10/ });
	expect(header.className).toContain("sticky");
});

test("the queue collapses", () => {
	const { view } = renderDrawer({
		queue: queueOf([prompt("q1", "next"), prompt("q2", "after")]),
	});
	const header = view.getByRole("button", { name: /^Queued 2/ });
	expect(header.getAttribute("aria-expanded")).toBe("true");
	fireEvent.click(header);
	expect(header.getAttribute("aria-expanded")).toBe("false");
	expect(view.queryAllByRole("option")).toHaveLength(0);
	fireEvent.click(header);
	expect(rowNames(view)).toEqual(["next", "after"]);
});

test("arrow keys move through the queue", () => {
	const { view, onExit } = renderDrawer({
		queue: queueOf([prompt("q1", "first"), prompt("q2", "second")]),
	});
	const [header, first, second] = stops(view);
	act(() => second?.focus());
	fireEvent.keyDown(second as HTMLElement, { key: "ArrowUp" });
	expect(document.activeElement).toBe(first as HTMLElement);
	fireEvent.keyDown(first as HTMLElement, { key: "ArrowUp" });
	expect(document.activeElement).toBe(header as HTMLElement);
	fireEvent.keyDown(header as HTMLElement, { key: "ArrowDown" });
	expect(document.activeElement).toBe(first as HTMLElement);
	expect(first?.getAttribute("tabindex")).toBe("0");
	expect(second?.getAttribute("tabindex")).toBe("-1");
	act(() => second?.focus());
	fireEvent.keyDown(second as HTMLElement, { key: "ArrowDown" });
	expect(onExit).toHaveBeenCalledWith("composer");
});

test("arrow up on the top of the drawer goes on to the prompt history", () => {
	const { view, onExit } = renderDrawer({
		queue: queueOf([prompt("q1", "first")]),
	});
	const [row] = stops(view);
	act(() => row?.focus());
	fireEvent.keyDown(row as HTMLElement, { key: "ArrowUp" });
	expect(onExit).toHaveBeenCalledWith("history");
});

test("the queue header toggles with Enter and Space and keeps focus in the drawer", () => {
	const { view, onExit } = renderDrawer({
		queue: queueOf([prompt("q1", "first"), prompt("q2", "second")]),
	});
	const header = view.getByRole("button", { name: /^Queued 2/ });
	const [row] = view.getAllByRole("option");
	act(() => row?.focus());
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

test("a prompt removed after focus left the drawer does not pull focus back", () => {
	const onExit = mock((_exit: string) => {});
	const props = { onExit };
	const second = prompt("q2", "two");
	const view = render(
		<WorkDrawer {...props} queue={queueOf([prompt("q1", "one"), second])} />,
	);
	const [first] = view.getAllByRole("option");
	act(() => first?.focus());
	act(() => first?.blur());
	expect(document.activeElement).toBe(document.body);
	view.rerender(<WorkDrawer {...props} queue={queueOf([second])} />);
	expect(document.activeElement).toBe(document.body);
	expect(onExit).not.toHaveBeenCalled();
});

test("removing the first of two queued prompts hands focus to the other", () => {
	const props = { onExit: () => {} };
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
	const props = { onExit: () => {} };
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
	const props = { onExit: () => {} };
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

test("enter steers a queued prompt and backspace removes one", () => {
	const queue = queueOf([prompt("q1", "first")]);
	const { view, onExit } = renderDrawer({ queue });
	const row = view.getByRole("option");
	fireEvent.keyDown(row, { key: "Enter" });
	expect(queue.steer).toHaveBeenCalledWith("q1");
	expect(onExit).toHaveBeenCalledWith("composer");
	fireEvent.keyDown(row, { key: "Backspace" });
	expect(queue.remove).toHaveBeenCalledWith("q1");
});

test("e edits a queued prompt in place and keeps its attachments", () => {
	const queue = queueOf([
		{
			...prompt("q1", "first"),
			content: [
				{ type: "text", text: "first" },
				{
					type: "attachment",
					attachmentId: "a1",
					name: "shot.png",
					mimeType: "image/png",
				},
			],
		} as UserMessage,
	]);
	const { view } = renderDrawer({ queue });
	const [queued] = view.getAllByRole("option");
	fireEvent.keyDown(queued as HTMLElement, { key: "e" });
	const editor = view.getByRole("textbox", { name: "Edit queued message" });
	fireEvent.change(editor, { target: { value: "first, revised" } });
	fireEvent.keyDown(editor, { key: "Enter" });
	expect(queue.update).toHaveBeenCalledTimes(1);
	const [id, content] = (queue.update as ReturnType<typeof mock>).mock
		.calls[0] as [string, UserContent[]];
	expect(id).toBe("q1");
	expect(content[0]).toEqual({ type: "text", text: "first, revised" });
	expect(content.slice(1).map((part) => part.type)).toEqual(["attachment"]);
	expect(queue.remove).not.toHaveBeenCalled();
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
				queue: queueOf([prompt("q1", "first"), prompt("q2", "second")]),
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
	const { editor, placeCaret } = renderComposer({ queue: undefined });
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

test("shift tab enters the drawer only when the queue is actionable", () => {
	const inert = renderComposer({
		queue: { ...queueOf([prompt("q1", "first")]), actionable: false },
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
