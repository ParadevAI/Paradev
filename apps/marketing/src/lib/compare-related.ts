import type { ComparisonPage } from "./compare-utils";

export const RELATED_COMPARISONS_LIMIT = 6;

type RelatedCandidate = Pick<
	ComparisonPage,
	"slug" | "url" | "date" | "competitors"
>;

function competitorKeys(page: RelatedCandidate): Set<string> {
	return new Set(page.competitors.map((name) => name.trim().toLowerCase()));
}

export function getRelatedComparisonPages<T extends RelatedCandidate>(
	page: RelatedCandidate,
	pages: T[],
	{
		redirectedPaths = new Set<string>(),
		limit = RELATED_COMPARISONS_LIMIT,
	}: { redirectedPaths?: ReadonlySet<string>; limit?: number } = {},
): T[] {
	const own = competitorKeys(page);

	return pages
		.filter(
			(candidate) =>
				candidate.slug !== page.slug && !redirectedPaths.has(candidate.url),
		)
		.map((candidate) => ({
			candidate,
			overlap: [...competitorKeys(candidate)].filter((key) => own.has(key))
				.length,
			time: new Date(candidate.date).getTime() || 0,
		}))
		.sort(
			(a, b) =>
				b.overlap - a.overlap ||
				b.time - a.time ||
				a.candidate.slug.localeCompare(b.candidate.slug),
		)
		.slice(0, limit)
		.map(({ candidate }) => candidate);
}
