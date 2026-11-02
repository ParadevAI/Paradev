import { mergeRegister } from "@lexical/utils";
import {
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	COMMAND_PRIORITY_LOW,
	KEY_ARROW_LEFT_COMMAND,
	KEY_ARROW_RIGHT_COMMAND,
	type LexicalEditor,
} from "lexical";

function $exitInlineCode(
	event: KeyboardEvent | null,
	edge: "start" | "end",
): boolean {
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
	const beyond =
		edge === "end" ? node.getNextSibling() : node.getPreviousSibling();
	if (!atEdge || $isTextNode(beyond)) return false;
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
