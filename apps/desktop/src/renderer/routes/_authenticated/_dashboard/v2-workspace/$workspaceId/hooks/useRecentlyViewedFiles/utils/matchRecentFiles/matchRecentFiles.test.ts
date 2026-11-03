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
});
