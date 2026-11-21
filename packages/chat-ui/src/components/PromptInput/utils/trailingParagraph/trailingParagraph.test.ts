import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
	$createCodeNode,
	$isCodeNode,
	CodeHighlightNode,
	CodeNode,
} from "@lexical/code";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isParagraphNode,
	$isRangeSelection,
	createEditor,
	type LexicalEditor,
} from "lexical";
import { registerTrailingParagraph } from "./trailingParagraph";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

function setup() {
	const editor = createEditor({
		namespace: "trailing-paragraph-test",
		nodes: [CodeNode, CodeHighlightNode],
		onError: (error) => {
			throw error;
		},
	});
	const root = document.createElement("div");
	root.contentEditable = "true";
	document.body.append(root);
	editor.setRootElement(root);
	return editor;
}

const update = (editor: LexicalEditor, fn: () => void) =>
	editor.update(fn, { discrete: true });

const read = (editor: LexicalEditor) =>
	editor.getEditorState().read(() => {
		const selection = $getSelection();
		return {
			blocks: $getRoot()
				.getChildren()
				.map((node) =>
					$isCodeNode(node) ? "code" : $isParagraphNode(node) ? "p" : "?",
				),
			caretIn:
				$isRangeSelection(selection) &&
				selection.anchor.getNode().getTopLevelElement()?.getType(),
		};
	});

describe("registerTrailingParagraph", () => {
	it("keeps an empty line under a code block that ends the editor", () => {
		const editor = setup();
		registerTrailingParagraph(editor);
		update(editor, () => {
			const code = $createCodeNode().append($createTextNode("a"));
			$getRoot().clear().append(code);
			code.selectEnd();
		});

		expect(read(editor)).toEqual({ blocks: ["code", "p"], caretIn: "code" });
	});

	it("adds the line to content that was there before it registered", () => {
		const editor = setup();
		update(editor, () => $getRoot().clear().append($createCodeNode()));
		registerTrailingParagraph(editor);

		expect(read(editor).blocks).toEqual(["code", "p"]);
	});

	it("moves the caret into the code block on Backspace from the empty line", () => {
		const editor = setup();
		registerTrailingParagraph(editor);
		update(editor, () => {
			$getRoot()
				.clear()
				.append($createCodeNode().append($createTextNode("a")));
		});
		update(editor, () => {
			const selection = $getRoot().selectEnd();
			selection.deleteCharacter(true);
		});

		expect(read(editor)).toEqual({ blocks: ["code", "p"], caretIn: "code" });
	});

	it("leaves a paragraph that ends the editor alone", () => {
		const editor = setup();
		registerTrailingParagraph(editor);
		update(editor, () => {
			$getRoot()
				.clear()
				.append(
					$createCodeNode(),
					$createParagraphNode().append($createTextNode("after")),
				);
		});

		expect(read(editor).blocks).toEqual(["code", "p"]);
	});
});
