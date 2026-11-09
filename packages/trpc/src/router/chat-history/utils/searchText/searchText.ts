import {
	type Item,
	isHiddenText,
	type UserMessage,
} from "@superset/chat/protocol";

const MAX_SEARCH_TEXT_CHARS = 32_000;
const ATTACHMENT_TAG = /<attachment path="[^"]*"[^>]*\/>/g;
const HIDDEN_BLOCK = /<superset-context>[\s\S]*?<\/superset-context>/g;
const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;
const CODE_PUNCTUATION = /[/._:()[\]{}<>`#=-]+/g;

/**
 * What a search can match: the first 32,000 characters of what the user and
 * the agent said, and tool titles. Reads an item of any shape: a host may
 * push one this version does not know.
 */
export function searchTextForItem(item: Item): string {
	const fields = item as Record<string, unknown>;
	let text = "";
	if (item.kind === "user_message" && Array.isArray(fields.content)) {
		text = (fields.content as UserMessage["content"])
			.flatMap((part) =>
				part?.type === "text" &&
				typeof part.text === "string" &&
				!part.hidden &&
				!isHiddenText(part.text)
					? [part.text]
					: [],
			)
			.join("\n");
	} else if (item.kind === "agent_message") {
		text = stringOr(fields.text);
	} else if (item.kind === "tool_call") {
		text = stringOr(fields.title);
	}
	return text
		.replace(HIDDEN_BLOCK, " ")
		.replace(ATTACHMENT_TAG, " ")
		.trim()
		.slice(0, MAX_SEARCH_TEXT_CHARS);
}

function stringOr(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** The query split the way `chat_search_text` splits what it indexes. */
export function splitSearchQuery(query: string): string {
	return query
		.replace(CAMEL_BOUNDARY, "$1 $2")
		.replace(CODE_PUNCTUATION, " ")
		.replace(/\s+/g, " ")
		.trim();
}
