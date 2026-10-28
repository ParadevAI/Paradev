import type { MessageEmojiSuggestion } from "@superset/chat-ui/MessageComposer";
import { emojis } from "@tiptap/extension-emoji";
import { useCallback } from "react";
import { rankEmoji } from "../../utils/rankEmoji";
import { slackNames } from "../../utils/slackEmoji";

const LIMIT = 20;

/** `:query` matches in Slack's order, each under the name Slack uses. */
export function useEmojiSuggestions() {
	return useCallback(
		(query: string): MessageEmojiSuggestion[] =>
			rankEmoji(emojis, query.toLowerCase(), LIMIT).flatMap((item) =>
				item.emoji
					? [{ name: slackNames(item)[0] ?? item.name, emoji: item.emoji }]
					: [],
			),
		[],
	);
}
