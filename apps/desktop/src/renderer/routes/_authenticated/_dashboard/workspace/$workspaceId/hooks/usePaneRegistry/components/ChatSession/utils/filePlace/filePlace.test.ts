import { describe, expect, test } from "bun:test";
import { filePlace, reviewFilter } from "./filePlace";

const ROOT = "/Users/me/worktrees/repo";

describe("filePlace", () => {
	test("maps a path in the worktree to the repo-relative path the diff pane uses", () => {
		expect(filePlace(`${ROOT}/src/billing/tax.ts`, ROOT)).toEqual({
			absolutePath: `${ROOT}/src/billing/tax.ts`,
			relativePath: "src/billing/tax.ts",
			directory: "src/billing",
			name: "tax.ts",
		});
		expect(filePlace("README.md", ROOT)).toMatchObject({
			absolutePath: `${ROOT}/README.md`,
			relativePath: "README.md",
			directory: "",
		});
	});

	test("matches a worktree the agent spells with different case", () => {
		expect(
			filePlace("/users/me/Worktrees/repo/src/a.ts", "/Users/me/worktrees/repo")
				.relativePath,
		).toBe("src/a.ts");
	});

	test("keeps a path outside the worktree out of the diff filter", () => {
		const outside = filePlace("/Users/me/.claude/notes.md", ROOT);
		const sibling = filePlace(`${ROOT}-other/a.ts`, ROOT);

		expect(outside.relativePath).toBeNull();
		expect(sibling.relativePath).toBeNull();
		expect(reviewFilter([outside, sibling])).toBeNull();
		expect(reviewFilter([outside, filePlace(`${ROOT}/a.ts`, ROOT)])).toEqual({
			paths: ["a.ts"],
		});
	});

	test("keeps only the turn's range when it changed too many files for the pane to remember", () => {
		const range = { fromHash: "before", toHash: "after" };
		const many = Array.from({ length: 500 }, (_, i) =>
			filePlace(`${ROOT}/src/file-${i}.ts`, ROOT),
		);

		expect(reviewFilter(many, range)).toEqual({ range });
		expect(reviewFilter(many)).toBeNull();
		expect(reviewFilter(many.slice(0, 3), range)?.paths).toHaveLength(3);
	});
});
