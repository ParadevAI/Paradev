import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { stripInlineMarkdown } from "./content-utils";

const PAGE_CONTENT_DIRS = ["blog", "category", "changelog", "compare"];

test("page content leaves the only H1 to the page title", () => {
	for (const dir of PAGE_CONTENT_DIRS) {
		const dirPath = path.join("content", dir);
		for (const file of readdirSync(dirPath).filter((f) => f.endsWith(".mdx"))) {
			const { content } = matter(
				readFileSync(path.join(dirPath, file), "utf8"),
			);
			const prose = content.replace(/^```[\s\S]*?^```/gm, "");
			expect({ file, h1: prose.match(/^# .+$/m)?.[0] }).toEqual({
				file,
				h1: undefined,
			});
		}
	}
});

test("stripInlineMarkdown keeps only the visible heading text", () => {
	expect(
		stripInlineMarkdown(
			'Does `/schedule` work in [Paradev](/)? <PRBadge url="x" />',
		),
	).toBe("Does /schedule work in Paradev?");
});
