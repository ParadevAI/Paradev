import { findSuggestionMatch, type Trigger } from "@tiptap/suggestion";

/** Tiptap reads only the text node before the caret, so `x` in inline code before `:smi` looks like the start of a line. */
export function matchSuggestion(config: Trigger) {
	const match = findSuggestionMatch(config);
	if (!match || config.allowedPrefixes === null) return match;
	const { $position } = config;
	if (match.range.from <= $position.start()) return match;
	const before = $position.doc.textBetween(
		match.range.from - 1,
		match.range.from,
		"\0",
		"\0",
	);
	return before === "\0" || (config.allowedPrefixes ?? [" "]).includes(before)
		? match
		: null;
}
