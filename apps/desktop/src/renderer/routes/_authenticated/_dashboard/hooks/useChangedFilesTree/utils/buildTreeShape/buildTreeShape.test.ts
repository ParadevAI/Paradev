import { describe, expect, test } from "bun:test";
import { buildTreeShape } from "./buildTreeShape";

describe("buildTreeShape", () => {
	test("lists folders whose only child is another folder", () => {
		const { dirs, dirFileCount, chainDirs } = buildTreeShape([
			"a/b/c/x.ts",
			"a/b/c/y.ts",
			"a/z.ts",
			"d/e.ts",
		]);
		expect(dirs).toEqual(["a", "d", "a/b", "a/b/c"]);
		expect(dirFileCount.get("a")).toBe(3);
		expect([...chainDirs]).toEqual(["a/b"]);
	});
});
