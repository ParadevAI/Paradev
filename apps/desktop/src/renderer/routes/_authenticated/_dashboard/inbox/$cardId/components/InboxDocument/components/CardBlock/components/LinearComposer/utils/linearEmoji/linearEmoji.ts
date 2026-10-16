import { Extension } from "@tiptap/core";
import { type EmojiItem, emojis } from "@tiptap/extension-emoji";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { rankEmoji } from "renderer/components/MarkdownEditor/components/EmojiSuggestion";
import { EmojiSuggestionList } from "renderer/components/MarkdownEditor/components/EmojiSuggestion/components/EmojiSuggestionList";
import { matchSuggestion } from "renderer/components/MarkdownEditor/utils/matchSuggestion";
import { suggestionPopup } from "../suggestionPopup";

const MAX_RESULTS = 10;
const STANDARD = emojis.filter((item) => item.emoji);

/** Linear's `:name` menu. It writes the emoji itself and a space; a `:name:` typed in full stays as typed. */
export const LinearEmoji = Extension.create({
	name: "linearEmoji",
	addProseMirrorPlugins() {
		return [
			Suggestion<EmojiItem>({
				pluginKey: new PluginKey("linearEmoji"),
				editor: this.editor,
				char: ":",
				allowedPrefixes: [" "],
				findSuggestionMatch: matchSuggestion,
				items: ({ query }) =>
					query.length < 2 ? [] : rankEmoji(STANDARD, query, MAX_RESULTS),
				command: ({ editor, range, props }) => {
					editor
						.chain()
						.focus()
						.insertContentAt(range, { type: "text", text: `${props.emoji} ` })
						.run();
				},
				render: suggestionPopup(EmojiSuggestionList),
			}),
		];
	},
});
