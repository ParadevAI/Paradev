import {
	$convertFromMarkdownString,
	$convertToMarkdownString,
	BOLD_ITALIC_STAR,
	BOLD_STAR,
	CODE,
	type ElementTransformer,
	HEADING,
	INLINE_CODE,
	ITALIC_STAR,
	LINK,
	ORDERED_LIST,
	QUOTE,
	STRIKETHROUGH,
	type TextMatchTransformer,
	type Transformer,
	UNORDERED_LIST,
} from "@lexical/markdown";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$isElementNode,
	$isParagraphNode,
	$isTextNode,
	$parseSerializedNode,
	type EditorState,
	type LexicalNode,
	type SerializedLexicalNode,
	type TextNode,
} from "lexical";
import {
	chipFromJSON,
	MentionChipNode,
	type SerializedMentionChipNode,
} from "../../nodes/mentionChipNode";
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
	HEADING,
	LINK,
	BOLD_ITALIC_STAR,
	BOLD_STAR,
	ITALIC_STAR,
	STRIKETHROUGH,
];

const NEVER = /(?!)/;

const CHIP_TEXT: TextMatchTransformer = {
	dependencies: [MentionChipNode],
	export: (node) =>
		node instanceof MentionChipNode ? node.getTextContent() : null,
	importRegExp: NEVER,
	regExp: NEVER,
	type: "text-match",
};

/** Unformatted text leaves as typed; Lexical would backslash-escape `*_~` for the agent. */
const PLAIN_TEXT: TextMatchTransformer = {
	dependencies: [],
	export: (node) =>
		$isTextNode(node) && node.getFormat() === 0 ? node.getTextContent() : null,
	importRegExp: NEVER,
	regExp: NEVER,
	type: "text-match",
};

const EDGE_WHITESPACE = /^(\s*)([\s\S]*?)(\s*)$/;

const $sharesFormat = (node: TextNode, sibling: LexicalNode | null) =>
	$isTextNode(sibling) && (sibling.getFormat() & node.getFormat()) !== 0;

/**
 * Edge whitespace of formatted text goes outside its markers: `*x* y`.
 * Lexical writes `*x&#32;*y`, which markdown no longer reads as italic.
 */
const FORMATTED_TEXT: TextMatchTransformer = {
	dependencies: [],
	export: (node, _exportChildren, exportFormat) => {
		if (!$isTextNode(node) || node.getFormat() === 0) return null;
		const text = node.getTextContent();
		const [, lead = "", core = "", trail = ""] =
			EDGE_WHITESPACE.exec(text) ?? [];
		if (core !== "") {
			if (lead === "" && trail === "") return null;
			return `${lead}${exportFormat(node, core)}${trail}`;
		}
		const before = $sharesFormat(node, node.getPreviousSibling());
		const after = $sharesFormat(node, node.getNextSibling());
		if (!before && !after) return text;
		const tags = exportFormat(node, "");
		return before && !after ? `${tags}${text}` : `${text}${tags}`;
	},
	importRegExp: NEVER,
	regExp: NEVER,
	type: "text-match",
};

const EMPTY_BLOCK_LINE = /^[ \t]*(?:[-*+]|\d+[.)]|>)?[ \t]*$/;

/** The editor as the markdown the agent gets, without empty bullets or blank lines at its ends. */
export function $readPromptText(): string {
	const markdown = $convertToMarkdownString(
		[CHIP_TEXT, PLAIN_TEXT, FORMATTED_TEXT, ...FORMATS],
		undefined,
		true,
	);
	const lines = markdown.split("\n");
	while (lines.length > 0 && EMPTY_BLOCK_LINE.test(lines.at(-1) ?? ""))
		lines.pop();
	while (lines.length > 0 && EMPTY_BLOCK_LINE.test(lines[0] ?? ""))
		lines.shift();
	return lines.join("\n").trim();
}

/** The composer's draft: its Lexical state, or nothing when it is empty. */
export function draftOf(editorState: EditorState): ComposerDraftSegment[] {
	const { empty, text } = editorState.read(() => ({
		empty: $getRoot().getTextContent().trim() === "",
		text: $readPromptText(),
	}));
	return empty ? [] : [{ type: "editor", state: editorState.toJSON(), text }];
}

const ENTITY_OPEN = String.fromCodePoint(0xe000);
const ENTITY_CLOSE = String.fromCodePoint(0xe001);
const ENTITY_TOKENS = new RegExp(`${ENTITY_OPEN}(\\d+)${ENTITY_CLOSE}`, "g");

function $restoreEntities(node: LexicalNode, entities: readonly string[]) {
	if ($isTextNode(node)) {
		const text = node.getTextContent();
		if (text.includes(ENTITY_OPEN)) {
			node.setTextContent(
				text.replace(
					ENTITY_TOKENS,
					(_, index) => entities[Number(index)] ?? "",
				),
			);
		}
	} else if ($isElementNode(node)) {
		for (const child of node.getChildren()) $restoreEntities(child, entities);
	}
}

/** Lexical's import decodes every `&#N;`, and throws past U+10FFFF; typed ones stay as typed. */
function $importMarkdown(markdown: string): LexicalNode[] {
	if (markdown === "") return [];
	const entities: string[] = [];
	const shielded = markdown.replace(/&#\d+;/g, (entity) => {
		entities.push(entity);
		return `${ENTITY_OPEN}${entities.length - 1}${ENTITY_CLOSE}`;
	});
	$convertFromMarkdownString(shielded, FORMATS, undefined, true);
	if (entities.length > 0) $restoreEntities($getRoot(), entities);
	return $getRoot().getChildren();
}

/** A saved state this build cannot read, corrupted or from a newer build, is not loaded. */
function $importEditorSegment(
	segment: Extract<ComposerDraftSegment, { type: "editor" }>,
): LexicalNode[] {
	try {
		return segment.state.root.children.map((child) =>
			$parseSerializedNode(child),
		);
	} catch {
		return [];
	}
}

/**
 * Appends the segments after the editor's content, replacing it when it is
 * empty. Text and editor segments are blocks, a blank line apart; a chip goes
 * at the end of the last paragraph.
 */
export function $appendDraftSegments(
	segments: readonly ComposerDraftSegment[],
): void {
	if (segments.length === 0) return;
	const root = $getRoot();
	const blocks = root.getTextContent() === "" ? [] : root.getChildren();
	for (const segment of segments) {
		if (segment.type === "chip") {
			const last = blocks.at(-1);
			const paragraph = $isParagraphNode(last) ? last : $createParagraphNode();
			if (paragraph !== last) blocks.push(paragraph);
			paragraph.append(
				MentionChipNode.fromChip(segment.chip),
				$createTextNode(" "),
			);
			continue;
		}
		const imported =
			segment.type === "text"
				? $importMarkdown(segment.text)
				: $importEditorSegment(segment);
		if (imported.length === 0) continue;
		if (blocks.length > 0) blocks.push($createParagraphNode());
		blocks.push(...imported);
	}
	root.clear();
	if (blocks.length > 0) root.append(...blocks);
	root.selectEnd();
}

function chipsIn(node: SerializedLexicalNode): ComposerChip[] {
	if (node.type === "mention-chip") {
		return [chipFromJSON(node as SerializedMentionChipNode)];
	}
	const children = (node as { children?: SerializedLexicalNode[] }).children;
	return children ? children.flatMap(chipsIn) : [];
}

export function draftChips(
	segments: readonly ComposerDraftSegment[],
): ComposerChip[] {
	return segments.flatMap((segment) => {
		if (segment.type === "chip") return [segment.chip];
		if (segment.type === "editor") {
			const root = segment.state?.root;
			return root ? chipsIn(root) : [];
		}
		return [];
	});
}

export function draftText(segments: readonly ComposerDraftSegment[]): string {
	let text = "";
	for (const segment of segments) {
		if (segment.type === "chip") {
			text += `${segment.chip.serialized} `;
		} else if (segment.text !== "") {
			text += text === "" ? segment.text : `\n\n${segment.text}`;
		}
	}
	return text;
}
