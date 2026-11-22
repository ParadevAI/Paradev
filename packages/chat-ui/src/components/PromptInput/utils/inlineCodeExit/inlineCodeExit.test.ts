import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { $createLinkNode, LinkNode } from "@lexical/link";
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
	type LexicalNode,
	type TextNode,
} from "lexical";
import { registerInlineCodeExit } from "./inlineCodeExit";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

type Run = [text: string, code: boolean];

const plain = (text: string) => $createTextNode(text);
const code = (text: string) => $createTextNode(text).toggleFormat("code");

function setup(children: () => LexicalNode[]) {
	const editor = createEditor({
		namespace: "inline-code-exit-test",
		nodes: [LinkNode],
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
				.append($createParagraphNode().append(...children()));
		},
		{ discrete: true },
	);
	return editor;
}

/** Puts the caret at an edge of text node `index` the way a click would, presses the keys, then types. */
function interact(
	editor: LexicalEditor,
	caret: { index: number; edge: "start" | "end" },
	keys: KeyboardEventInit[],
	text = "",
) {
	const handled: boolean[] = [];
	let caretAfterKeys: { node: string; offset: number; code: boolean } | null =
		null;
	editor.update(
		() => {
			const node: TextNode | undefined =
				$getRoot().getAllTextNodes()[caret.index];
			if (!node) throw new Error("no such text node");
			const offset = caret.edge === "start" ? 0 : node.getTextContentSize();
			node.select(offset, offset).format = node.getFormat();
			for (const init of keys) {
				handled.push(
					editor.dispatchCommand(
						init.key === "ArrowLeft"
							? KEY_ARROW_LEFT_COMMAND
							: KEY_ARROW_RIGHT_COMMAND,
						new KeyboardEvent("keydown", init),
					),
				);
			}
			const selection = $getSelection();
			if (!$isRangeSelection(selection)) return;
			caretAfterKeys = {
				node: selection.anchor.getNode().getTextContent(),
				offset: selection.anchor.offset,
				code: selection.hasFormat("code"),
			};
			if (text) selection.insertText(text);
		},
		{ discrete: true },
	);
	const runs = editor.getEditorState().read(() =>
		$getRoot()
			.getAllTextNodes()
			.map((node): Run => [node.getTextContent(), node.hasFormat("code")]),
	);
	return { handled, caret: caretAfterKeys, runs };
}

describe("registerInlineCodeExit", () => {
	it("types plain text after code that ends the line once ArrowRight is pressed", () => {
		const editor = setup(() => [plain("run "), code("ls")]);

		expect(
			interact(
				editor,
				{ index: 1, edge: "end" },
				[{ key: "ArrowRight" }],
				" now",
			),
		).toEqual({
			handled: [true],
			caret: { node: "ls", offset: 2, code: false },
			runs: [
				["run ", false],
				["ls", true],
				[" now", false],
			],
		});
	});

	it("types plain text before code that starts the line once ArrowLeft is pressed", () => {
		const editor = setup(() => [code("ls"), plain(" runs")]);

		expect(
			interact(
				editor,
				{ index: 0, edge: "start" },
				[{ key: "ArrowLeft" }],
				"run ",
			),
		).toEqual({
			handled: [true],
			caret: { node: "ls", offset: 0, code: false },
			runs: [
				["run ", false],
				["ls", true],
				[" runs", false],
			],
		});
	});

	it("lets the second ArrowRight move the caret as usual", () => {
		const editor = setup(() => [code("ls")]);

		expect(
			interact(editor, { index: 0, edge: "end" }, [
				{ key: "ArrowRight" },
				{ key: "ArrowRight" },
			]).handled,
		).toEqual([true, false]);
	});

	it("leaves the caret alone when text follows the code", () => {
		const editor = setup(() => [code("ls"), plain(" after")]);

		expect(
			interact(editor, { index: 0, edge: "end" }, [{ key: "ArrowRight" }]),
		).toMatchObject({
			handled: [false],
			caret: { node: "ls", offset: 2, code: true },
		});
	});

	it("leaves the caret alone when text follows the link the code ends", () => {
		const editor = setup(() => [
			$createLinkNode("https://example.com").append(code("ls")),
			plain(" after"),
		]);

		expect(
			interact(editor, { index: 0, edge: "end" }, [{ key: "ArrowRight" }])
				.handled,
		).toEqual([false]);
	});

	it("leaves Shift+ArrowRight selection alone", () => {
		const editor = setup(() => [code("ls")]);

		expect(
			interact(editor, { index: 0, edge: "end" }, [
				{ key: "ArrowRight", shiftKey: true },
			]).handled,
		).toEqual([false]);
	});
});
