import type { MenuTextMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
	$getRoot,
	$getSelection,
	$isRangeSelection,
	$isTextNode,
} from "lexical";

export type CommandTokenMatch = MenuTextMatch & {
	leading: boolean;
	sigil: "/" | "$";
};

/**
 * What comes before the caret's text node: nothing in the message, a word
 * break (a new line or paragraph, or text that ends in a space), or a word.
 */
export type TokenStart = "message" | "word" | "none";

const LEADING = /^\/([^/\r\n]*)$/;
const INLINE = /(^|\s)(\/([\w:.-]*))$/;
const SKILL_SIGIL = /(^|\s)(\$([A-Za-z][\w:-]*)?)$/;

export function matchCommandToken(
	text: string,
	start: TokenStart = "message",
	after = "",
): CommandTokenMatch | null {
	const leading = start === "message" ? LEADING.exec(text) : null;
	if (leading) {
		return {
			leadOffset: 0,
			matchingString: leading[1] ?? "",
			replaceableString: leading[0],
			leading: true,
			sigil: "/",
		};
	}
	// A caret inside a word, such as `/et|c/hosts`, is editing it, not naming a command.
	if (/^\S/.test(after)) return null;
	const inline = INLINE.exec(text);
	if (inline) return inlineMatch(inline, start, "/");
	const skill = SKILL_SIGIL.exec(text);
	// `$HOME`, `$PATH` and `$5` are shell, not skills.
	const name = skill?.[3];
	if (!skill || (name && !/[a-z]/.test(name))) return null;
	return inlineMatch(skill, start, "$");
}

function inlineMatch(
	match: RegExpExecArray,
	start: TokenStart,
	sigil: CommandTokenMatch["sigil"],
): CommandTokenMatch | null {
	const space = match[1] ?? "";
	if (!space && start === "none") return null;
	return {
		leadOffset: match.index + space.length,
		matchingString: match[3] ?? "",
		replaceableString: match[2] ?? "",
		leading: false,
		sigil,
	};
}

/** Where the caret's text node starts, for `matchCommandToken`. */
export function $commandTokenStart(): TokenStart {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return "none";
	const node = selection.anchor.getNode();
	const previous = node.getPreviousSibling();
	if (previous === null) {
		return node.getParent()?.is($getRoot().getFirstChild())
			? "message"
			: "word";
	}
	if ($isTextNode(previous)) {
		return /\s$/.test(previous.getTextContent()) ? "word" : "none";
	}
	return previous.getType() === "linebreak" ? "word" : "none";
}

/** The caret's text node from the caret on, for `matchCommandToken`. */
export function $textAfterCaret(): string {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return "";
	const node = selection.anchor.getNode();
	if (!$isTextNode(node)) return "";
	const after = node.getTextContent().slice(selection.anchor.offset);
	if (after) return after;
	const next = node.getNextSibling();
	return $isTextNode(next) ? next.getTextContent() : "";
}
