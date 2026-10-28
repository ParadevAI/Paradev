import { describe, expect, test } from "bun:test";
import { fileMentionMatches } from "./fileMentions";

const recent = (relativePath: string) => ({
	relativePath,
	absolutePath: `/repo/${relativePath}`,
	lastAccessedAt: 0,
});
const match = (relativePath: string) => ({
	relativePath,
	absolutePath: `/repo/${relativePath}`,
	name: relativePath.split("/").at(-1) ?? relativePath,
});

describe("fileMentionMatches", () => {
	test("lists recent files first and drops them from the search results", () => {
		const paths = fileMentionMatches(
			"comp",
			[recent("src/Composer.tsx"), recent("src/Sidebar.tsx")],
			[match("src/Component.tsx"), match("src/Composer.tsx")],
		).map((file) => file.relativePath);
		expect(paths).toEqual(["src/Composer.tsx", "src/Component.tsx"]);
	});

	test("shows recent files before a query is typed", () => {
		const names = fileMentionMatches("", [recent("a/b/c.ts")], []).map(
			(file) => file.name,
		);
		expect(names).toEqual(["c.ts"]);
	});
});
