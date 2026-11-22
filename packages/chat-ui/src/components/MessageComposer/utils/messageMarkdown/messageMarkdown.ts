import {
	$convertToMarkdownString,
	BOLD_ITALIC_STAR,
	BOLD_STAR,
	CODE,
	INLINE_CODE,
	ITALIC_STAR,
	ITALIC_UNDERSCORE,
	LINK,
	ORDERED_LIST,
	QUOTE,
	STRIKETHROUGH,
	type TextFormatTransformer,
	type TextMatchTransformer,
	type Transformer,
	UNORDERED_LIST,
} from "@lexical/markdown";
import { MentionChipNode } from "../../../PromptInput/nodes/mentionChipNode";

const NEVER = /(?!)/;

/** Mentions leave the editor as their `@Name` text; nothing types them in. */
const MENTION_CHIP: TextMatchTransformer = {
	dependencies: [MentionChipNode],
	export: (node) =>
		node instanceof MentionChipNode ? node.getTextContent() : null,
	importRegExp: NEVER,
	regExp: NEVER,
	type: "text-match",
};

/** Slack's single-character marks: `*bold*`, `~strike~`. Typing only; messages store standard markdown. */
const SLACK_BOLD: TextFormatTransformer = {
	format: ["bold"],
	tag: "*",
	type: "text-format",
};
const SLACK_STRIKETHROUGH: TextFormatTransformer = {
	format: ["strikethrough"],
	tag: "~",
	type: "text-format",
};

const BLOCKS: Transformer[] = [UNORDERED_LIST, ORDERED_LIST, QUOTE, CODE];

/** What typing turns into formatting: markdown, plus Slack's `*bold*`, `_italic_` and `~strike~`. */
export const MESSAGE_SHORTCUTS: Transformer[] = [
	...BLOCKS,
	INLINE_CODE,
	BOLD_ITALIC_STAR,
	BOLD_STAR,
	SLACK_BOLD,
	ITALIC_UNDERSCORE,
	STRIKETHROUGH,
	SLACK_STRIKETHROUGH,
	LINK,
];

/** Stored markdown read back into the editor, without Slack's single-character marks. */
export const MESSAGE_IMPORT: Transformer[] = [
	...BLOCKS,
	INLINE_CODE,
	BOLD_ITALIC_STAR,
	BOLD_STAR,
	ITALIC_STAR,
	ITALIC_UNDERSCORE,
	STRIKETHROUGH,
	LINK,
];

const MESSAGE_EXPORT: Transformer[] = [
	MENTION_CHIP,
	...BLOCKS,
	INLINE_CODE,
	BOLD_ITALIC_STAR,
	BOLD_STAR,
	ITALIC_STAR,
	STRIKETHROUGH,
	LINK,
];

/** The editor's content as the markdown a message stores. */
export function $messageMarkdown(): string {
	return $convertToMarkdownString(MESSAGE_EXPORT, undefined, true).trim();
}
