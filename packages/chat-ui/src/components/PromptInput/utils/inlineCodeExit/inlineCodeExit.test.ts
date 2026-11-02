import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	createEditor,
	KEY_ARROW_LEFT_COMMAND,
	KEY_ARROW_RIGHT_COMMAND,
	type LexicalEditor,
} from "lexical";
import { registerInlineCodeExit } from "./inlineCodeExit";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

type Run = [text: string, code: boolean];

function setup(...runs: Run[]) {
	const editor = createEditor({
		namespace: "inline-code-exit-test",
		onError: (error) => {
			throw error;
		},
	});
	const root = document.createElement("div");
	root.contentEditable = "true";
	document.body.append(root);
	editor.setRootElement(root);
	registerInlineCodeExit(editor);
	editor.update(
		() => {
			$getRoot()
				.clear()
				.append(
					$createParagraphNode().append(
						...runs.map(([text, code]) => {
							const node = $createTextNode(text);
							return code ? node.toggleFormat("code") : node;
						}),
					),
				);
		},
		{ discrete: true },
	);
	return editor;
}

/** Puts the caret at an edge of run `index` the way a click would, presses the keys, then types. */
function interact(
	editor: LexicalEditor,
	caret: { index: number; edge: "start" | "end" },
	keys: KeyboardEventInit[],
	text = "",
) {
	const handled: boolean[] = [];
	editor.update(
		() => {
			const node = $getRoot().getAllTextNodes()[caret.index];
			if (!node) throw new Error("no such run");
			const offset = caret.edge === "start" ? 0 : node.getTextContentSize();
			node.select(offset, offset).format = node.getFormat();
			for (const init of keys) {
				const event = new KeyboardEvent("keydown", init);
				handled.push(
					editor.dispatchCommand(
						init.key === "ArrowLeft"
							? KEY_ARROW_LEFT_COMMAND
							: KEY_ARROW_RIGHT_COMMAND,
						event,
					),
				);
			}
			const selection = $getSelection();
			if (text && $isRangeSelection(selection)) selection.insertText(text);
		},
		{ discrete: true },
	);
	const runs = editor.getEditorState().read(() =>
		$getRoot()
			.getAllTextNodes()
			.map((node): Run => [node.getTextContent(), node.hasFormat("code")]),
	);
	return { handled, runs };
}

describe("registerInlineCodeExit", () => {
	it("types plain text after code that ends the line once ArrowRight is pressed", () => {
		const editor = setup(["run ", false], ["ls", true]);

		expect(
			interact(
				editor,
				{ index: 1, edge: "end" },
				[{ key: "ArrowRight" }],
				" now",
			),
		).toEqual({
			handled: [true],
			runs: [
				["run ", false],
				["ls", true],
				[" now", false],
			],
		});
	});

	it("types plain text before code that starts the line once ArrowLeft is pressed", () => {
		const editor = setup(["ls", true], [" runs", false]);

		expect(
			interact(
				editor,
				{ index: 0, edge: "start" },
				[{ key: "ArrowLeft" }],
				"run ",
			),
		).toEqual({
			handled: [true],
			runs: [
				["run ", false],
				["ls", true],
				[" runs", false],
			],
		});
	});

	it("lets the second ArrowRight move the caret as usual", () => {
		const editor = setup(["ls", true]);

		expect(
			interact(editor, { index: 0, edge: "end" }, [
				{ key: "ArrowRight" },
				{ key: "ArrowRight" },
			]).handled,
		).toEqual([true, false]);
	});

	it("leaves the caret alone when plain text follows the code", () => {
		const editor = setup(["ls", true], [" after", false]);

		expect(
			interact(editor, { index: 0, edge: "end" }, [{ key: "ArrowRight" }])
				.handled,
		).toEqual([false]);
	});

	it("leaves Shift+ArrowRight selection alone", () => {
		const editor = setup(["ls", true]);

		expect(
			interact(editor, { index: 0, edge: "end" }, [
				{ key: "ArrowRight", shiftKey: true },
			]).handled,
		).toEqual([false]);
	});
});
