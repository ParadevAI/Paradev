import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	RELEASE_HIGHLIGHT_ICONS,
	releaseNotesResponseSchema,
} from "@superset/shared/release-notes";
import matter from "gray-matter";
import { getChangelogEntries, getReleaseNotes } from "./changelog";

test("release highlights in changelog frontmatter are well-formed", () => {
	for (const entry of getChangelogEntries()) {
		const { data } = matter(
			readFileSync(`content/changelog/${entry.slug}.mdx`, "utf8"),
		);
		if (data.version === undefined && data.highlights === undefined) continue;

		expect(String(data.version)).toMatch(/^\d+\.\d+\.\d+$/);
		expect(entry.highlights).toEqual(data.highlights);
		for (const highlight of data.highlights) {
			expect(RELEASE_HIGHLIGHT_ICONS).toContain(highlight.icon);
		}
	}
});

test("release notes feed has absolute URLs and only versioned entries", () => {
	const releases = getReleaseNotes(
		[
			{
				slug: "a",
				url: "/changelog/a",
				title: "A",
				date: "2026-10-11",
				image: "/changelog/a.png",
				version: "1.38.0",
				highlights: [{ icon: "plug", title: "T", description: "D" }],
				content: "",
			},
			{
				slug: "b",
				url: "/changelog/b",
				title: "B",
				date: "2026-10-04",
				content: "",
			},
		],
		"https://superset.sh",
	);

	expect(releaseNotesResponseSchema.parse({ releases }).releases).toEqual([
		{
			version: "1.38.0",
			date: "2026-10-11",
			title: "A",
			image: "https://superset.sh/changelog/a.png",
			url: "https://superset.sh/changelog/a",
			highlights: [{ icon: "plug", title: "T", description: "D" }],
		},
	]);
});
