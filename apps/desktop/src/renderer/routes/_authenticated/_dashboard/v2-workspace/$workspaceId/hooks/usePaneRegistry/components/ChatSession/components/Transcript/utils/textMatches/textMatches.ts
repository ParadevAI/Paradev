export type TextMatch = { start: number; end: number };

export function textMatches(text: string, needle: string): TextMatch[] {
	if (!needle) return [];
	const folded = text.toLowerCase();
	const offsets: TextMatch[] = [];
	if (folded.length !== text.length) {
		let start = 0;
		for (const character of text) {
			const end = start + character.length;
			for (let i = 0; i < character.toLowerCase().length; i += 1) {
				offsets.push({ start, end });
			}
			start = end;
		}
	}
	const matches: TextMatch[] = [];
	for (
		let index = folded.indexOf(needle);
		index !== -1;
		index = folded.indexOf(needle, index + needle.length)
	) {
		matches.push({
			start: offsets[index]?.start ?? index,
			end: offsets[index + needle.length - 1]?.end ?? index + needle.length,
		});
	}
	return matches;
}
