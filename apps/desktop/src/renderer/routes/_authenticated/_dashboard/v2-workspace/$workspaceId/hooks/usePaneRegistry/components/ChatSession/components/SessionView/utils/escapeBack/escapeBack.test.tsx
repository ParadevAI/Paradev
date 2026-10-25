import { afterEach, expect, mock, test } from "bun:test";
import { emptySnapshot } from "@superset/chat/core";
import type { BackgroundTask } from "@superset/chat/protocol";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { useDrawerEntry } from "../../../Composer/hooks/useDrawerEntry";
import { WorkDrawer, type WorkDrawerHandle } from "../../../WorkDrawer";
import { escapeBack } from "./escapeBack";

afterEach(cleanup);

const shell: BackgroundTask = {
	id: "task-1",
	kind: "process",
	name: "bun dev",
	canStop: true,
	startedAtMs: 0,
};

function Pane({ goBack }: { goBack: (() => void) | undefined }) {
	const drawerRef = useRef<WorkDrawerHandle>(null);
	const editorRef = useRef<HTMLDivElement>(null);
	const entry = useDrawerEntry({
		enterDrawer: (options) => drawerRef.current?.focusLast(options) ?? false,
		focusComposer: () => editorRef.current?.focus(),
		recallHistory: () => {},
	});
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: test pane
		<div onKeyDown={escapeBack(goBack)}>
			<WorkDrawer
				onAppendToComposer={() => {}}
				onExit={(exit) => entry.returnFocus(exit === "history")}
				onMoveToBackground={() => {}}
				onOpenSubagent={() => {}}
				onStop={() => {}}
				ref={drawerRef}
				snapshot={emptySnapshot()}
				tasks={[shell]}
			/>
			<div onKeyDownCapture={entry.onKeyDownCapture}>
				<div
					className="prompt-input-editor"
					contentEditable
					ref={editorRef}
					suppressContentEditableWarning
				/>
			</div>
		</div>
	);
}

function renderPane(goBack: (() => void) | undefined) {
	const view = render(<Pane goBack={goBack} />);
	const editor = view.container.querySelector(
		".prompt-input-editor",
	) as HTMLElement;
	return { view, editor };
}

test("escape in a subagent's composer goes back a level", () => {
	const goBack = mock(() => {});
	const { editor } = renderPane(goBack);
	act(() => editor.focus());
	expect(fireEvent.keyDown(editor, { key: "Escape" })).toBe(false);
	expect(goBack).toHaveBeenCalledTimes(1);
});

test("escape in the drawer returns to the composer first", () => {
	const goBack = mock(() => {});
	const { view, editor } = renderPane(goBack);
	const row = view.getByRole("option");
	act(() => row.focus());
	fireEvent.keyDown(row, { key: "Escape" });
	expect(document.activeElement).toBe(editor);
	expect(goBack).not.toHaveBeenCalled();
	fireEvent.keyDown(editor, { key: "Escape" });
	expect(goBack).toHaveBeenCalledTimes(1);
});

test("an escape something else handled does not go back", () => {
	const goBack = mock(() => {});
	const { editor } = renderPane(goBack);
	editor.addEventListener("keydown", (event) => event.preventDefault());
	fireEvent.keyDown(editor, { key: "Escape" });
	expect(goBack).not.toHaveBeenCalled();
});

test("escape in the main chat is left alone", () => {
	const { editor } = renderPane(undefined);
	expect(fireEvent.keyDown(editor, { key: "Escape" })).toBe(true);
});
