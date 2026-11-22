import {
	$getRoot,
	$getSelection,
	$isElementNode,
	$isRangeSelection,
	$isTextNode,
	type LexicalNode,
	type PointType,
} from "lexical";

type Side = "before" | "after";

function edgeCharacter(node: LexicalNode, side: Side): string | null {
	const text = node.getTextContent();
	if (text === "") return null;
	return side === "before" ? (text.at(-1) ?? null) : (text[0] ?? null);
}

function $characterBeside(point: PointType, side: Side): string | null {
	const node = point.getNode();
	if ($isTextNode(node)) {
		const text = node.getTextContent();
		const index = side === "before" ? point.offset - 1 : point.offset;
		if (index >= 0 && index < text.length) return text[index] ?? null;
		const sibling =
			side === "before" ? node.getPreviousSibling() : node.getNextSibling();
		return sibling ? edgeCharacter(sibling, side) : null;
	}
	if ($isElementNode(node)) {
		const index = side === "before" ? point.offset - 1 : point.offset;
		const child = index >= 0 ? node.getChildAtIndex(index) : null;
		return child ? edgeCharacter(child, side) : null;
	}
	return null;
}

/**
 * Inserts at the cursor, or at the end when the editor has no cursor, padding
 * with a space where the text would touch a word. A highlighted range is kept:
 * the text goes after it.
 */
export function $insertTranscript(transcript: string) {
	const text = transcript.trim();
	if (!text) return;
	let selection = $getSelection();
	if (!$isRangeSelection(selection)) {
		$getRoot().selectEnd();
		selection = $getSelection();
	}
	if (!$isRangeSelection(selection)) return;
	const end = selection.isBackward() ? selection.anchor : selection.focus;
	selection.anchor.set(end.key, end.offset, end.type);
	selection.focus.set(end.key, end.offset, end.type);
	const before = $characterBeside(selection.anchor, "before");
	const after = $characterBeside(selection.anchor, "after");
	const lead = before !== null && !/\s/.test(before) ? " " : "";
	const trail = after !== null && !/\s/.test(after) ? " " : "";
	selection.insertText(`${lead}${text}${trail}`);
}
