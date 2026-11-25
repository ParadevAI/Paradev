import { describe, expect, test } from "bun:test";
import { groupFilesByFolder } from "./groupFilesByFolder";

describe("groupFilesByFolder", () => {
	test("puts root files first, then folders by path, files by basename", () => {
		const groups = groupFilesByFolder([
			{ path: "src/b/z.ts" },
			{ path: "README.md" },
			{ path: "src/a.ts" },
			{ path: "src/b/y.ts" },
		]);
		expect(
			groups.map((g) => [g.folderPath, g.files.map((f) => f.path)]),
		).toEqual([
			["", ["README.md"]],
			["src", ["src/a.ts"]],
			["src/b", ["src/b/y.ts", "src/b/z.ts"]],
		]);
	});
});
