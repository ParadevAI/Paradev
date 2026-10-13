import { describe, expect, test } from "bun:test";
import {
	fenceInfo,
	fenceLanguage,
	fenceText,
	isDiffLanguage,
	isSingleFilePatch,
	parseFence,
} from "./fencedCode";

describe("fenceLanguage", () => {
	test("reads the language off the class markdown sets", () => {
		expect(fenceLanguage("language-TypeScript")).toBe("typescript");
		expect(fenceLanguage("other language-diff")).toBe("diff");
	});
	test("is null without a language or a string class", () => {
		expect(fenceLanguage("")).toBeNull();
		expect(fenceLanguage(undefined)).toBeNull();
		expect(fenceLanguage("hljs")).toBeNull();
	});
});

describe("parseFence", () => {
	test("keeps the case of a path the class carries", () => {
		expect(fenceInfo("language-ts:src/App.tsx")).toBe("ts:src/App.tsx");
		expect(fenceInfo("hljs")).toBeNull();
	});

	test("reads a language and a path", () => {
		expect(parseFence("TS:packages/chat/src/acpAdapter.ts")).toEqual({
			language: "ts",
			file: {
				path: "packages/chat/src/acpAdapter.ts",
				fileName: "acpAdapter.ts",
				href: "packages/chat/src/acpAdapter.ts:1",
			},
		});
	});

	test("reads a line range and a path, and opens at the first line", () => {
		expect(parseFence("994:1002:src/harness/acpAdapter.ts")).toEqual({
			language: null,
			file: {
				path: "src/harness/acpAdapter.ts",
				fileName: "acpAdapter.ts",
				href: "src/harness/acpAdapter.ts:994",
			},
		});
	});

	test("reads a bare path, with or without a line", () => {
		expect(parseFence("src/app.ts").file?.href).toBe("src/app.ts:1");
		expect(parseFence("package.json").file?.fileName).toBe("package.json");
		expect(parseFence("src/app.ts:12:4").file).toEqual({
			path: "src/app.ts:12:4",
			fileName: "app.ts",
			href: "src/app.ts:12:4",
		});
		expect(parseFence("docker/Dockerfile").file?.fileName).toBe("Dockerfile");
	});

	test.each([
		["ts", "ts"],
		["TypeScript", "typescript"],
		["c++", "c++"],
		["dockerfile", "dockerfile"],
		["Makefile", "makefile"],
		["python:3", "python:3"],
		["12:20", "12:20"],
		["https://example.com/a.ts", "https://example.com/a.ts"],
	])("leaves %s a language", (info, language) => {
		expect(parseFence(info)).toEqual({ language, file: null });
	});

	test("an unmarked fence has neither", () => {
		expect(parseFence(null)).toEqual({ language: null, file: null });
	});
});

describe("fenceText", () => {
	test("joins string children and drops the trailing newline", () => {
		expect(fenceText(["a\n", "b\n"])).toBe("a\nb");
		expect(fenceText("x")).toBe("x");
	});
	test("drops nullish children and keeps numbers", () => {
		expect(fenceText([null, "a", undefined, 1])).toBe("a1");
	});
});

describe("isDiffLanguage", () => {
	test("covers the names agents use for patches", () => {
		expect(isDiffLanguage("diff")).toBe(true);
		expect(isDiffLanguage("patch")).toBe(true);
		expect(isDiffLanguage("ts")).toBe(false);
		expect(isDiffLanguage(null)).toBe(false);
	});
});

const ONE_FILE_PATCH = `--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`;

const TWO_FILE_PATCH = `${ONE_FILE_PATCH}--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-old
+new
`;

describe("isSingleFilePatch", () => {
	test("accepts a patch for one file with hunks", () => {
		expect(isSingleFilePatch(ONE_FILE_PATCH)).toBe(true);
	});
	test("rejects a patch spanning several files", () => {
		expect(isSingleFilePatch(TWO_FILE_PATCH)).toBe(false);
	});
	test("rejects text that is not a patch", () => {
		expect(isSingleFilePatch("const x = 1;")).toBe(false);
		expect(isSingleFilePatch("")).toBe(false);
	});
});
