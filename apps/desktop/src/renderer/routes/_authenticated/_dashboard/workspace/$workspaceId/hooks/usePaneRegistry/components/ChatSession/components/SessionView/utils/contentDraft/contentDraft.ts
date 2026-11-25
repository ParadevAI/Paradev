import { splitQuotedReplies, userMessageText } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import type { ComposerDraft } from "@superset/chat-ui/PromptInput";

export function contentDraft(content: UserContent[]): ComposerDraft {
	const { quotes, text } = splitQuotedReplies(userMessageText({ content }));
	return {
		segments: [{ type: "text", text }],
		attachments: [],
		...(quotes.length > 0 ? { quotes } : {}),
	};
}
