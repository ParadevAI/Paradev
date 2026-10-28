"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
	$createTextNode,
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_HIGH,
	TextNode,
} from "lexical";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageEmojiSuggestion } from "../../types";
import { MessageEmojiOption } from "../../utils/emojiOption";
import { $isInCode } from "../../utils/isInCode";
import { EmojiMenu } from "./components/EmojiMenu";

const MAX_SUGGESTIONS = 8;
// Slack opens the list after two characters, so a time like "10:30" stays text.
const QUERY = /(^|\s)(:([\w+-]{2,}))$/;
const CLOSED_SHORTCODE = /(^|\s):([\w+-]+):$/;

type EmojiTypeaheadProps = {
	getSuggestions: (query: string) => MessageEmojiSuggestion[];
	menuSlot: HTMLElement | null;
};

/** `:` then a name lists matching emoji; typing the closing `:` of an exact name swaps in the emoji. */
export function EmojiTypeahead({
	getSuggestions,
	menuSlot,
}: EmojiTypeaheadProps) {
	const [editor] = useLexicalComposerContext();
	const [query, setQuery] = useState<string | null>(null);
	const options = useMemo(
		() =>
			query == null
				? []
				: getSuggestions(query)
						.slice(0, MAX_SUGGESTIONS)
						.map((suggestion) => new MessageEmojiOption(suggestion)),
		[getSuggestions, query],
	);

	useEffect(
		() =>
			editor.registerNodeTransform(TextNode, (node) => {
				const selection = $getSelection();
				if (
					!$isRangeSelection(selection) ||
					!selection.isCollapsed() ||
					selection.anchor.key !== node.getKey()
				) {
					return;
				}
				if ($isInCode()) return;
				const before = node.getTextContent().slice(0, selection.anchor.offset);
				const match = CLOSED_SHORTCODE.exec(before);
				const name = match?.[2];
				if (!match || !name) return;
				const exact = getSuggestions(name).find((s) => s.name === name);
				if (!exact) return;
				const start = match.index + (match[1]?.length ?? 0);
				const text = node.getTextContent();
				node.setTextContent(
					text.slice(0, start) + exact.emoji + text.slice(before.length),
				);
				node.select(start + exact.emoji.length, start + exact.emoji.length);
			}),
		[editor, getSuggestions],
	);

	return (
		<LexicalTypeaheadMenuPlugin<MessageEmojiOption>
			options={options}
			onQueryChange={setQuery}
			onClose={() => setQuery(null)}
			triggerFn={(text) => {
				if ($isInCode()) return null;
				const match = QUERY.exec(text);
				if (!match) return null;
				return {
					leadOffset: match.index + (match[1]?.length ?? 0),
					matchingString: match[3] ?? "",
					replaceableString: match[2] ?? "",
				};
			}}
			commandPriority={COMMAND_PRIORITY_HIGH}
			onSelectOption={(option, nodeToReplace, closeMenu) => {
				editor.update(() => {
					const emoji = $createTextNode(option.suggestion.emoji);
					if (nodeToReplace) nodeToReplace.replace(emoji);
					else $getSelection()?.insertNodes([emoji]);
					emoji.select();
					closeMenu();
				});
			}}
			menuRenderFn={(
				anchorElementRef,
				{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
			) =>
				anchorElementRef.current && menuSlot && options.length > 0
					? createPortal(
							<EmojiMenu
								suggestions={options.map((option) => option.suggestion)}
								selectedIndex={selectedIndex}
								onHighlight={setHighlightedIndex}
								onSelect={(index) => {
									const option = options[index];
									if (option) selectOptionAndCleanUp(option);
								}}
							/>,
							menuSlot,
						)
					: null
			}
		/>
	);
}
