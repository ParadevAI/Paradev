import { describe, expect, test } from "bun:test";
import { matchRecentFiles } from "./matchRecentFiles";

const recent = (relativePath: string) => ({
	relativePath,
	absolutePath: `/repo/${relativePath}`,
	lastAccessedAt: 0,
});

describe("matchRecentFiles", () => {
	test("lists open files first, then filters by the query", () => {
		const paths = matchRecentFiles(
			[recent("src/a.ts"), recent("src/B.ts"), recent("docs/b.md")],
			"b",
			new Set(["/repo/docs/b.md"]),
		).map((file) => file.relativePath);
		expect(paths).toEqual(["docs/b.md", "src/B.ts"]);
	});

	test("finds a match older than the display limit", () => {
		const files = Array.from({ length: 15 }, (_, i) => recent(`src/f${i}.ts`));
		const paths = matchRecentFiles(files, "f14", new Set()).map(
			(file) => file.relativePath,
		);
		expect(paths).toEqual(["src/f14.ts"]);
		expect(matchRecentFiles(files, "", new Set())).toHaveLength(10);
	});
});
