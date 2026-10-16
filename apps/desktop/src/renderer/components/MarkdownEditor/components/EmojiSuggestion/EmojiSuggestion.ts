import { Emoji, type EmojiItem, emojis } from "@tiptap/extension-emoji";
import { ReactRenderer } from "@tiptap/react";
import type {
	SuggestionKeyDownProps,
	SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { matchSuggestion } from "../../utils/matchSuggestion";
import { suggestionKeyDown } from "../../utils/suggestionKeyDown";
import {
	EmojiSuggestionList,
	type EmojiSuggestionListRef,
} from "./components/EmojiSuggestionList";
import { rankEmoji } from "./utils/rankEmoji";

const MAX_RESULTS = 10;

/** The standard set plus a workspace's own emoji, which complete first by name. */
export function createEmojiSuggestion(
	custom: EmojiItem[] = [],
	{ emojiSpace = false }: { emojiSpace?: boolean } = {},
) {
	const all = [...custom, ...emojis];
	return Emoji.configure({
		enableEmoticons: true,
		emojis: all,
		HTMLAttributes: {
			class:
				"[&>img]:inline-block [&>img]:size-[1.25em] [&>img]:align-[-0.25em]",
		},
		suggestion: {
			allowedPrefixes: [" "],
			findSuggestionMatch: matchSuggestion,
			items: ({ query }) => {
				// Two characters, as Slack waits for: one matches half the catalogue,
				// and an empty query leads with the regional-indicator letters.
				if (query.length < 2) return [];
				return rankEmoji(all, query, MAX_RESULTS);
			},
			// The default command appends " " even when a space already follows.
			command: ({ editor, range, props }) => {
				const spaceFollows = editor.state.doc
					.textBetween(
						range.to,
						Math.min(range.to + 1, editor.state.doc.content.size - 1),
					)
					.startsWith(" ");
				editor
					.chain()
					.focus()
					.insertContentAt(range, [
						{ type: "emoji", attrs: props },
						...(emojiSpace && !spaceFollows
							? [{ type: "text", text: " " }]
							: []),
					])
					.run();
			},
			render: () => {
				let component: ReactRenderer<
					EmojiSuggestionListRef,
					SuggestionProps<EmojiItem>
				> | null = null;
				let popup: TippyInstance[] | null = null;

				return {
					onStart: (props: SuggestionProps<EmojiItem>) => {
						component = new ReactRenderer(EmojiSuggestionList, {
							props,
							editor: props.editor,
						});

						if (!props.clientRect) return;

						const clientRect = props.clientRect;
						popup = tippy("body", {
							getReferenceClientRect: () => clientRect?.() ?? new DOMRect(),
							appendTo: () =>
								props.editor.view.dom.closest("[role=dialog]") ?? document.body,
							content: component.element,
							showOnCreate: props.items.length > 0,
							interactive: true,
							trigger: "manual",
							placement: "bottom-start",
						});
					},
					onUpdate: (props: SuggestionProps<EmojiItem>) => {
						component?.updateProps(props);
						if (!props.clientRect) return;
						const getClientRect = props.clientRect;
						popup?.[0]?.setProps({
							getReferenceClientRect: () => getClientRect() ?? new DOMRect(),
						});
						if (props.items.length > 0) popup?.[0]?.show();
						else popup?.[0]?.hide();
					},
					onKeyDown: (props: SuggestionKeyDownProps) =>
						suggestionKeyDown(popup?.[0], component?.ref, props),
					onExit: () => {
						popup?.[0]?.destroy();
						component?.destroy();
					},
				};
			},
		},
	});
}

export const EmojiSuggestion = createEmojiSuggestion();
