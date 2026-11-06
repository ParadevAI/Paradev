import type { EmojiItem } from "@tiptap/extension-emoji";

/** How well one name matches: lower is better, null is no match. */
function nameScore(name: string, q: string): number | null {
	if (name === q) return 0;
	if (name.startsWith(q)) return 1;
	if (name.split(/[_-]/).some((word) => word.startsWith(q))) return 2;
	if (name.includes(q)) return 3;
	return null;
}

/**
 * Slack's order for `:query`: the shortcode itself decides, exact before
 * prefix before a word inside it before anywhere in it; tags and the
 * description only fill in after every shortcode match. Shorter names win
 * a tie, then the catalogue's own order.
 */
export function rankEmoji(
	all: readonly EmojiItem[],
	query: string,
	limit: number,
): EmojiItem[] {
	const q = query.toLowerCase();
	const scored: {
		item: EmojiItem;
		score: number;
		length: number;
		index: number;
	}[] = [];
	all.forEach((item, index) => {
		let best: { score: number; length: number } | null = null;
		for (const name of item.shortcodes.map((s) => s.toLowerCase())) {
			const score = nameScore(name, q);
			if (score === null) continue;
			if (
				!best ||
				score < best.score ||
				(score === best.score && name.length < best.length)
			) {
				best = { score, length: name.length };
			}
		}
		const byTag =
			item.tags.some((t) => t.toLowerCase().includes(q)) ||
			item.name.toLowerCase().includes(q);
		if (!best && !byTag) return;
		const score = best?.score ?? 4;
		const length = best?.length ?? item.name.length;
		scored.push({ item, score, length, index });
	});
	return scored
		.sort(
			(a, b) => a.score - b.score || a.length - b.length || a.index - b.index,
		)
		.slice(0, limit)
		.map((s) => s.item);
}
