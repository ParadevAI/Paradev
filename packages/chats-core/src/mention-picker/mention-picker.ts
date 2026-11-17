import type { MentionCandidate } from "../mention-candidates/mention-candidates.ts";

/** Candidates whose label, or any word of their name, starts with the query (case-insensitive), in the given order. */
export function matchMentions(
	candidates: MentionCandidate[],
	query: string,
): MentionCandidate[] {
	const q = query.toLowerCase();
	return candidates.filter(
		(c) =>
			c.label.toLowerCase().startsWith(q) ||
			c.name
				.toLowerCase()
				.split(/\s+/)
				.some((w) => w.startsWith(q)),
	);
}

/** Arrow keys move through the list and wrap around. */
export const moveSelection = (index: number, delta: number, count: number) =>
	count === 0 ? 0 : (index + delta + count) % count;
