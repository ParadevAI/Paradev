import { mergeRegister } from "@lexical/utils";
import {
	$getSelection,
	$isElementNode,
	$isRangeSelection,
	$isTextNode,
	COMMAND_PRIORITY_LOW,
	KEY_ARROW_LEFT_COMMAND,
	KEY_ARROW_RIGHT_COMMAND,
	type LexicalEditor,
	type LexicalNode,
} from "lexical";

type Edge = "start" | "end";

function $hasTextBeyond(node: LexicalNode, edge: Edge): boolean {
	let current = node;
	for (;;) {
		const sibling =
			edge === "end" ? current.getNextSibling() : current.getPreviousSibling();
		if (sibling) {
			if ($isTextNode(sibling)) return true;
			if (!$isElementNode(sibling) || !sibling.isInline()) return false;
			return $isTextNode(
				edge === "end"
					? sibling.getFirstDescendant()
					: sibling.getLastDescendant(),
			);
		}
		const parent = current.getParent();
		if (!parent?.isInline()) return false;
		current = parent;
	}
}

function $exitInlineCode(event: KeyboardEvent | null, edge: Edge): boolean {
	const selection = $getSelection();
	if (
		!$isRangeSelection(selection) ||
		!selection.isCollapsed() ||
		!selection.hasFormat("code") ||
		event?.shiftKey ||
		event?.altKey ||
		event?.metaKey ||
		event?.ctrlKey
	)
		return false;
	const node = selection.anchor.getNode();
	if (!$isTextNode(node) || !node.hasFormat("code")) return false;
	const atEdge =
		edge === "end"
			? selection.anchor.offset === node.getTextContentSize()
			: selection.anchor.offset === 0;
	if (!atEdge || $hasTextBeyond(node, edge)) return false;
	event?.preventDefault();
	selection.toggleFormat("code");
	return true;
}

/** The caret takes the format of the text it lands in, so code at a line's edge has no plain side to type into. */
export function registerInlineCodeExit(editor: LexicalEditor): () => void {
	return mergeRegister(
		editor.registerCommand<KeyboardEvent | null>(
			KEY_ARROW_RIGHT_COMMAND,
			(event) => $exitInlineCode(event, "end"),
			COMMAND_PRIORITY_LOW,
		),
		editor.registerCommand<KeyboardEvent | null>(
			KEY_ARROW_LEFT_COMMAND,
			(event) => $exitInlineCode(event, "start"),
			COMMAND_PRIORITY_LOW,
		),
	);
}
