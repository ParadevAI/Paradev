import { describe, expect, test } from "bun:test";
import { cloneParentDir } from "./cloneParentDir";

describe("cloneParentDir", () => {
	test("is the folder that holds the primary repository", () => {
		expect(cloneParentDir("/src/orbit/web")).toBe("/src/orbit");
		expect(cloneParentDir("C:\\src\\orbit\\web\\")).toBe("C:\\src\\orbit");
	});

	test("is undefined without a primary path or a parent", () => {
		expect(cloneParentDir(undefined)).toBeUndefined();
		expect(cloneParentDir("/web")).toBeUndefined();
	});
});
