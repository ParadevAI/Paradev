import {
	$generateNodesFromSerializedNodes,
	$getClipboardDataFromSelection,
	type LexicalClipboardData,
} from "@lexical/clipboard";
import { $isCodeNode } from "@lexical/code";
import {
	$createParagraphNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	createEditor,
	type ElementNode,
	type LexicalNode,
} from "lexical";
import { COMPOSER_NODES } from "../../constants";
import { $readPromptText } from "../draftSegments";

function $appendBlocks(nodes: LexicalNode[]) {
	const root = $getRoot();
	let paragraph: ElementNode | null = null;
	for (const node of nodes) {
		if (node.isInline()) {
			if (!paragraph) {
				paragraph = $createParagraphNode();
				root.append(paragraph);
			}
			paragraph.append(node);
		} else {
			root.append(node);
			paragraph = null;
		}
	}
}

function markdownOf(lexicalJson: string): string | null {
	let nodes: Parameters<typeof $generateNodesFromSerializedNodes>[0];
	try {
		nodes = JSON.parse(lexicalJson).nodes;
	} catch {
		return null;
	}
	const scratch = createEditor({
		nodes: COMPOSER_NODES,
		onError: (error) => {
			throw error;
		},
	});
	scratch.update(
		() => $appendBlocks($generateNodesFromSerializedNodes(nodes)),
		{ discrete: true },
	);
	return scratch.getEditorState().read($readPromptText);
}

function $isWithinOneCodeBlock(): boolean {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return false;
	const block = selection.anchor.getNode().getTopLevelElement();
	return (
		$isCodeNode(block) &&
		block.is(selection.focus.getNode().getTopLevelElement())
	);
}

/** What a copy puts on the clipboard: Lexical's own data, with markdown as the plain text. */
export function $clipboardData(): LexicalClipboardData {
	const data = $getClipboardDataFromSelection();
	const lexical = data["application/x-lexical-editor"];
	if (!lexical || $isWithinOneCodeBlock()) return data;
	const markdown = markdownOf(lexical);
	return markdown ? { ...data, "text/plain": markdown } : data;
}
