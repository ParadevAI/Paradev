import { $isCodeNode } from "@lexical/code";
import { $isLinkNode } from "@lexical/link";
import { $isListNode, ListNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isQuoteNode } from "@lexical/rich-text";
import { $findMatchingParent, $getNearestNodeOfType } from "@lexical/utils";
import { $getSelection, $isRangeSelection } from "lexical";
import { useEffect, useState } from "react";

export interface FormatState {
	bold: boolean;
	italic: boolean;
	strikethrough: boolean;
	code: boolean;
	link: boolean;
	list: "bullet" | "number" | null;
	quote: boolean;
	codeBlock: boolean;
}

const EMPTY: FormatState = {
	bold: false,
	italic: false,
	strikethrough: false,
	code: false,
	link: false,
	list: null,
	quote: false,
	codeBlock: false,
};

/** What the selection is formatted as, so toolbar buttons can show it. */
export function useFormatState(): FormatState {
	const [editor] = useLexicalComposerContext();
	const [state, setState] = useState(EMPTY);

	useEffect(
		() =>
			editor.registerUpdateListener(({ editorState }) => {
				editorState.read(() => {
					const selection = $getSelection();
					if (!$isRangeSelection(selection)) {
						setState(EMPTY);
						return;
					}
					const anchor = selection.anchor.getNode();
					const block = anchor.getTopLevelElement();
					const list = $getNearestNodeOfType(anchor, ListNode);
					setState({
						bold: selection.hasFormat("bold"),
						italic: selection.hasFormat("italic"),
						strikethrough: selection.hasFormat("strikethrough"),
						code: selection.hasFormat("code"),
						link: $findMatchingParent(anchor, $isLinkNode) !== null,
						list:
							list && $isListNode(list)
								? list.getListType() === "number"
									? "number"
									: "bullet"
								: null,
						quote: $isQuoteNode(block),
						codeBlock: $isCodeNode(block),
					});
				});
			}),
		[editor],
	);

	return state;
}
