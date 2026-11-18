export type MatchRange = [start: number, end: number];

function isWordStart(text: string, index: number): boolean {
	return index === 0 || !/[\p{L}\p{N}]/u.test(text[index - 1] ?? "");
}

function findWordPrefix(text: string, token: string): number {
	let index = text.indexOf(token);
	while (index >= 0) {
		if (isWordStart(text, index)) return index;
		index = text.indexOf(token, index + 1);
	}
	return -1;
}

/**
 * Where `query` matches in `text`, as offsets into `text`: the whole query
 * as a substring, or else each of its words at the start of a word.
 */
export function matchRanges(text: string, query: string): MatchRange[] {
	const needle = query.trim().toLowerCase();
	const haystack = text.toLowerCase();
	// Lowercasing can change a string's length ("İ"), and then its offsets
	// no longer point into `text`.
	if (!needle || haystack.length !== text.length) return [];

	const whole = haystack.indexOf(needle);
	if (whole >= 0) return [[whole, whole + needle.length]];

	const ranges: MatchRange[] = [];
	for (const token of needle.split(/\s+/)) {
		const start = findWordPrefix(haystack, token);
		if (start < 0) return [];
		ranges.push([start, start + token.length]);
	}
	ranges.sort((a, b) => a[0] - b[0]);
	const merged: MatchRange[] = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
		else merged.push([range[0], range[1]]);
	}
	return merged;
}
