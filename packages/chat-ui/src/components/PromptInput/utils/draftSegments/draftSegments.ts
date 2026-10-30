import {
	$convertFromMarkdownString,
	$convertToMarkdownString,
	BOLD_ITALIC_STAR,
	BOLD_STAR,
	CODE,
	type ElementTransformer,
	INLINE_CODE,
	ITALIC_STAR,
	ORDERED_LIST,
	QUOTE,
	STRIKETHROUGH,
	type TextMatchTransformer,
	type Transformer,
	UNORDERED_LIST,
} from "@lexical/markdown";
import { $getRoot, $isTextNode } from "lexical";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import type { ComposerChip, ComposerDraftSegment } from "../../types";

const TYPED_FORMATS: Transformer[] = [
	UNORDERED_LIST,
	ORDERED_LIST,
	QUOTE,
	CODE,
	INLINE_CODE,
];

/** Typing only: in stored markdown a line starting with `|` is a table row. */
const PIPE_QUOTE: ElementTransformer = { ...QUOTE, regExp: /^\|\s/ };

/** What typing converts; bold and italic come only from ⌘B and ⌘I. */
export const TYPED_SHORTCUTS: Transformer[] = [...TYPED_FORMATS, PIPE_QUOTE];

/** No `_`/`__` forms: prompts are full of `__init__` and `snake_case`. */
const FORMATS: Transformer[] = [
	...TYPED_FORMATS,
	BOLD_ITALIC_STAR,
	BOLD_STAR,
	ITALIC_STAR,
	STRIKETHROUGH,
];

const NEVER = /(?!)/;
const CHIP_OPEN = String.fromCodePoint(0xe000);
const CHIP_CLOSE = String.fromCodePoint(0xe001);
const CHIP_TOKEN = new RegExp(`${CHIP_OPEN}(\\d+)${CHIP_CLOSE}`);
const CHIP_TOKENS = new RegExp(CHIP_TOKEN, "g");
const chipToken = (index: number) => `${CHIP_OPEN}${index}${CHIP_CLOSE}`;

/** Unformatted text leaves as typed; Lexical would backslash-escape `*_~` for the agent. */
const PLAIN_TEXT: TextMatchTransformer = {
	dependencies: [],
	export: (node) =>
		$isTextNode(node) && node.getFormat() === 0 ? node.getTextContent() : null,
	importRegExp: NEVER,
	regExp: NEVER,
	type: "text-match",
};

/** The editor as markdown, split around its chips. */
export function $readDraftSegments(): ComposerDraftSegment[] {
	const chips: ComposerChip[] = [];
	const chipExport: TextMatchTransformer = {
		dependencies: [MentionChipNode],
		export: (node) => {
			if (!(node instanceof MentionChipNode)) return null;
			chips.push(node.toChip());
			return chipToken(chips.length - 1);
		},
		importRegExp: NEVER,
		regExp: NEVER,
		type: "text-match",
	};
	const markdown = $convertToMarkdownString(
		[chipExport, PLAIN_TEXT, ...FORMATS],
		undefined,
		true,
	);
	const segments: ComposerDraftSegment[] = [];
	let cursor = 0;
	for (const match of markdown.matchAll(CHIP_TOKENS)) {
		const chip = chips[Number(match[1])];
		if (!chip) continue;
		if (match.index > cursor) {
			segments.push({
				type: "text",
				text: markdown.slice(cursor, match.index),
			});
		}
		segments.push({ type: "chip", chip });
		cursor = match.index + match[0].length;
	}
	if (cursor < markdown.length) {
		segments.push({ type: "text", text: markdown.slice(cursor) });
	}
	return segments;
}

/** Parses the segments' markdown and appends it after the editor's content. */
export function $appendDraftSegments(
	segments: readonly ComposerDraftSegment[],
): void {
	const chips: ComposerChip[] = [];
	const markdown = segments
		.map((segment) => {
			if (segment.type === "text") return segment.text;
			chips.push(segment.chip);
			return chipToken(chips.length - 1);
		})
		.join("");
	if (markdown === "") return;
	const chipImport: TextMatchTransformer = {
		dependencies: [MentionChipNode],
		export: () => null,
		importRegExp: CHIP_TOKEN,
		regExp: NEVER,
		replace: (textNode, match) => {
			const chip = chips[Number(match[1])];
			if (chip) textNode.replace(MentionChipNode.fromChip(chip));
			else textNode.remove();
		},
		type: "text-match",
	};
	const root = $getRoot();
	const previous = root.getTextContent() === "" ? [] : root.getChildren();
	$convertFromMarkdownString(
		markdown,
		[chipImport, ...FORMATS],
		undefined,
		true,
	);
	const first = root.getFirstChild();
	for (const node of previous) {
		if (first) first.insertBefore(node);
		else root.append(node);
	}
	root.selectEnd();
}

/** Formatted text keeps its edge spaces as `&#32;` in markdown; the agent gets the space. */
export function draftText(segments: readonly ComposerDraftSegment[]): string {
	return segments
		.map((segment) =>
			segment.type === "text"
				? segment.text.replace(/&#(\d+);/g, (_, code) =>
						String.fromCodePoint(Number(code)),
					)
				: segment.chip.serialized,
		)
		.join("");
}

const EMPTY_BLOCK_LINE = /^[ \t]*(?:[-*+]|\d+[.)]|>)?[ \t]*$/;

/** What the agent gets: the draft without the empty bullets and blank lines at its ends. */
export function promptText(segments: readonly ComposerDraftSegment[]): string {
	const lines = draftText(segments).split("\n");
	while (lines.length > 0 && EMPTY_BLOCK_LINE.test(lines.at(-1) ?? ""))
		lines.pop();
	while (lines.length > 0 && EMPTY_BLOCK_LINE.test(lines[0] ?? ""))
		lines.shift();
	return lines.join("\n").trim();
}
