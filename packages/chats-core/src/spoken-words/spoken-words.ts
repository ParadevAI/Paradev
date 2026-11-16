import type { SpokenWord } from "../model/model.ts";
import { plainText } from "../plain-text/plain-text.ts";

/**
 * A spoken reply's words with their times: as the voice said them when the note has them (`voice.words`), else its
 * text spread over its length by each word's characters, so older replies still light along, near enough.
 */
export function spokenWordsOf(
	words: readonly SpokenWord[] | undefined,
	text: string,
	durationMs: number,
): SpokenWord[] {
	if (words?.length) return [...words];
	const said = plainText(text).split(/\s+/).filter(Boolean);
	const total = said.reduce((n, w) => n + w.length + 1, 0);
	let at = 0;
	return said.map((text) => {
		const startMs = Math.round((at / total) * durationMs);
		at += text.length + 1;
		return {
			text,
			startMs,
			endMs: Math.round(((at - 1) / total) * durationMs),
		};
	});
}
