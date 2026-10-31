import { describe, expect, test } from "bun:test";
import { resolveOpenPath } from "./resolve-open-path";

const links: Record<string, string> = {
	"/repo/src/cart.ts": "/repo/src/cart.ts",
	"/repo/escape.ts": "/etc/passwd",
	"/etc/hosts": "/etc/hosts",
};
const fs = {
	realFile: (path: string) => links[path] ?? null,
	realDir: (path: string) => path,
};

describe("resolveOpenPath", () => {
	test("the editor gets an absolute path from either form", () => {
		expect(resolveOpenPath("file", "src/cart.ts", "/repo", fs)).toBe(
			"/repo/src/cart.ts",
		);
		expect(resolveOpenPath("file", "/repo/src/cart.ts", "/repo", fs)).toBe(
			"/repo/src/cart.ts",
		);
	});

	test("a missing file is not found", () => {
		expect(() => resolveOpenPath("file", "src/nope.ts", "/repo", fs)).toThrow(
			"No file src/nope.ts in this workspace",
		);
	});

	test("the editor refuses files outside the worktree, symlinked or not", () => {
		expect(() => resolveOpenPath("file", "/etc/hosts", "/repo", fs)).toThrow(
			"outside this workspace",
		);
		expect(() => resolveOpenPath("file", "escape.ts", "/repo", fs)).toThrow(
			"outside this workspace",
		);
	});

	test("Changes gets a path relative to the worktree", () => {
		expect(resolveOpenPath("changes", "/repo/src/cart.ts", "/repo", fs)).toBe(
			"src/cart.ts",
		);
		expect(resolveOpenPath("changes", "./src/cart.ts", "/repo", fs)).toBe(
			"src/cart.ts",
		);
	});

	test("Changes rejects a path outside the worktree", () => {
		expect(() =>
			resolveOpenPath("changes", "/elsewhere/a.ts", "/repo", fs),
		).toThrow("outside this workspace");
	});
});
