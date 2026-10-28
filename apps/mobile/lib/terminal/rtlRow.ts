/**
 * Whether a terminal row reads right-to-left: its first strong character is
 * Hebrew or Arabic (the paragraph rule of the Unicode bidi algorithm, which
 * is what `unicode-bidi: plaintext` applies to the row once it is marked).
 *
 * Inlined into the terminal WebView page via `toString()`
 * (scripts/generate-terminal-html.ts), so it must stay self-contained.
 */
export function isRtlRow(text: string): boolean {
	const rtl =
		/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
	const ltr = /\p{L}/u;
	for (const ch of text) {
		if (rtl.test(ch)) return true;
		if (ltr.test(ch)) return false;
	}
	return false;
}
