const UNSPACED = /[\p{Script=Han}　-〿぀-ヿ＀-￯]/u;
const PUNCTUATION = /\p{P}/u;

/**
 * `appendDraft`'s join, the same rule as the iOS `ComposerDictatedText.join`:
 * a space between the two, except after whitespace, before punctuation, or
 * next to a script that does not separate words.
 */
export function joinDraft(draft: string, text: string): string {
	const addition = text.trim();
	if (!addition) return draft;
	const base = draft.replace(/[ \t]+$/, "");
	const last = base.at(-1);
	const first = addition[0];
	if (!last || !first) return base + addition;
	if (/\s/.test(last) || PUNCTUATION.test(first)) return base + addition;
	if (UNSPACED.test(last) || UNSPACED.test(first)) return base + addition;
	return `${base} ${addition}`;
}
