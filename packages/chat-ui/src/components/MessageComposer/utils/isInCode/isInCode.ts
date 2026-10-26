import { $isCodeNode } from "@lexical/code";
import { $getSelection, $isRangeSelection, $isTextNode } from "lexical";

/** The caret sits in a code block or inline code, where typed text stays literal. */
export function $isInCode(): boolean {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return false;
	if (selection.hasFormat("code")) return true;
	const node = selection.anchor.getNode();
	if ($isTextNode(node) && node.hasFormat("code")) return true;
	return $isCodeNode(node.getTopLevelElement());
}
