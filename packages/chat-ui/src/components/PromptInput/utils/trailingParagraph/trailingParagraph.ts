import { $isCodeNode } from "@lexical/code";
import {
	$createParagraphNode,
	$getRoot,
	HISTORY_MERGE_TAG,
	type LexicalEditor,
	RootNode,
} from "lexical";

function $ensureTrailingParagraph(root: RootNode) {
	const last = root.getLastChild();
	if ($isCodeNode(last)) last.insertAfter($createParagraphNode(), false);
}

/** A code block never ends the editor, so the caret can always get below it. */
export function registerTrailingParagraph(editor: LexicalEditor): () => void {
	const unregister = editor.registerNodeTransform(
		RootNode,
		$ensureTrailingParagraph,
	);
	editor.update(() => $ensureTrailingParagraph($getRoot()), {
		discrete: true,
		tag: HISTORY_MERGE_TAG,
	});
	return unregister;
}
