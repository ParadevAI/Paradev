import { describe, expect, test } from "bun:test";
import { resolveOpenPath } from "./resolve-open-path";

const exists = (path: string) => path === "/repo/src/cart.ts";

describe("resolveOpenPath", () => {
	test("the editor gets an absolute path from either form", () => {
		expect(resolveOpenPath("file", "src/cart.ts", "/repo", exists)).toBe(
			"/repo/src/cart.ts",
		);
		expect(resolveOpenPath("file", "/repo/src/cart.ts", "/repo", exists)).toBe(
			"/repo/src/cart.ts",
		);
	});

	test("a missing file is not found", () => {
		expect(() =>
			resolveOpenPath("file", "src/nope.ts", "/repo", exists),
		).toThrow("No file src/nope.ts in this workspace");
	});

	test("Changes gets a path relative to the worktree", () => {
		expect(
			resolveOpenPath("changes", "/repo/src/cart.ts", "/repo", exists),
		).toBe("src/cart.ts");
		expect(resolveOpenPath("changes", "./src/cart.ts", "/repo", exists)).toBe(
			"src/cart.ts",
		);
	});

	test("Changes rejects a path outside the worktree", () => {
		expect(() =>
			resolveOpenPath("changes", "/elsewhere/a.ts", "/repo", exists),
		).toThrow("outside this workspace");
	});
});
