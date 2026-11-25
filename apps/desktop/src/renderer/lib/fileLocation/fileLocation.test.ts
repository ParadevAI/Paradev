import { expect, test } from "bun:test";
import { splitFileLocation, splitLineAnchor } from "./fileLocation";

test("splits the line forms agents write", () => {
	expect(splitFileLocation("src/app.ts")).toEqual({ path: "src/app.ts" });
	expect(splitFileLocation("src/app.ts:12")).toEqual({
		path: "src/app.ts",
		row: 12,
	});
	expect(splitFileLocation("src/app.ts:12:3")).toEqual({
		path: "src/app.ts",
		row: 12,
		col: 3,
	});
	expect(splitFileLocation("src/app.ts#L12C3")).toEqual({
		path: "src/app.ts",
		row: 12,
		col: 3,
	});
});

test("keeps the start of a range", () => {
	expect(splitFileLocation("src/app.ts:17-33")).toEqual({
		path: "src/app.ts",
		row: 17,
	});
	expect(splitFileLocation("src/app.ts#L12-L20")).toEqual({
		path: "src/app.ts",
		row: 12,
	});
});

test("splitLineAnchor ignores colon suffixes", () => {
	expect(splitLineAnchor("src/app.ts:12")).toBeNull();
	expect(splitLineAnchor("src/app.ts#L12")).toEqual({
		path: "src/app.ts",
		row: 12,
	});
});
