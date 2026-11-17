/** Your words as they're said: the settled part, then the part that may still change. */
export interface LiveWords {
	settled: string;
	tentative: string;
}

/** What the words are, as one line: the settled part with the tentative part after it. */
export const liveLine = (words: LiveWords) =>
	[words.settled, words.tentative].filter(Boolean).join(" ").trim();
