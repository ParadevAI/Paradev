import { describe, expect, test } from "bun:test";
import { orderRecentFiles } from "./orderRecentFiles";

function file(relativePath: string, lastAccessedAt = 0) {
	return {
		relativePath,
		absolutePath: `/repo/${relativePath}`,
		lastAccessedAt,
	};
}

const RECENT = [file("src/a.ts"), file("src/b.ts"), file("docs/c.md")];

describe("orderRecentFiles", () => {
	test("open files lead, the rest keep their order", () => {
		expect(
			orderRecentFiles(RECENT, new Set(["/repo/docs/c.md"]), "", 10).map(
				(f) => f.relativePath,
			),
		).toEqual(["docs/c.md", "src/a.ts", "src/b.ts"]);
	});

	test("a query narrows by path, case-insensitively", () => {
		expect(
			orderRecentFiles(RECENT, new Set(), "SRC", 10).map((f) => f.relativePath),
		).toEqual(["src/a.ts", "src/b.ts"]);
	});

	test("caps the result", () => {
		expect(orderRecentFiles(RECENT, new Set(), "", 2)).toHaveLength(2);
	});
});
