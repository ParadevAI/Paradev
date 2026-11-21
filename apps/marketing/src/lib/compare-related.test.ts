import { describe, expect, test } from "bun:test";
import { getRelatedComparisonPages } from "./compare-related";

function page(slug: string, date: string, competitors: string[]) {
	return { slug, url: `/compare/${slug}`, date, competitors };
}

describe("getRelatedComparisonPages", () => {
	const current = page("orca-alternative", "2026-10-01", ["Orca", "Conductor"]);
	const pages = [
		current,
		page("old-both", "2026-03-01", ["orca", "Conductor"]),
		page("new-one", "2026-11-01", ["Conductor"]),
		page("old-one", "2026-04-01", ["Orca"]),
		page("newest-none", "2026-11-10", ["Cursor"]),
		page("old-none", "2026-01-01", ["Zed"]),
		page("moved", "2026-11-12", ["Orca", "Conductor"]),
	];

	test("ranks by shared competitors, then by newest date", () => {
		const related = getRelatedComparisonPages(current, pages, {
			redirectedPaths: new Set(["/compare/moved"]),
		});
		expect(related.map((p) => p.slug)).toEqual([
			"old-both",
			"new-one",
			"old-one",
			"newest-none",
			"old-none",
		]);
	});

	test("caps the list at the limit", () => {
		const related = getRelatedComparisonPages(current, pages, { limit: 2 });
		expect(related.map((p) => p.slug)).toEqual(["moved", "old-both"]);
	});
});
