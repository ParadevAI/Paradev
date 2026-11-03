"use client";

import { $createCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
	$isParagraphNode,
	COMMAND_PRIORITY_LOW,
	KEY_DOWN_COMMAND,
	TextNode,
} from "lexical";
import { useEffect, useRef } from "react";

const FENCE = "```";

/**
 * Slack turns a line into a code block on the third typed backtick, without
 * the space Lexical's shortcut waits for. A pasted or backspaced fence stays text.
 */
export function CodeFencePlugin() {
	const [editor] = useLexicalComposerContext();
	const typedBacktick = useRef(false);
	useEffect(
		() =>
			mergeRegister(
				editor.registerCommand(
					KEY_DOWN_COMMAND,
					(event) => {
						typedBacktick.current = event.key === "`";
						return false;
					},
					COMMAND_PRIORITY_LOW,
				),
				editor.registerNodeTransform(TextNode, (node) => {
					const paragraph = node.getParent();
					if (
						!typedBacktick.current ||
						!$isParagraphNode(paragraph) ||
						paragraph.getChildrenSize() !== 1 ||
						node.getTextContent() !== FENCE
					) {
						return;
					}
					typedBacktick.current = false;
					const code = $createCodeNode();
					paragraph.replace(code);
					code.select();
				}),
			),
		[editor],
	);
	return null;
}
