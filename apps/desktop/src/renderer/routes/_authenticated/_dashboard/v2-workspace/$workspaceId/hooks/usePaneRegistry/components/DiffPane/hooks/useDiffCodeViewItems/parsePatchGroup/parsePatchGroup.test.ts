import { describe, expect, test } from "bun:test";
import { buildContentKey } from "renderer/routes/_authenticated/_dashboard/utils/buildContentKey";
import {
	isWhitespaceOnly,
	parsePatchGroup,
	splitPatchSegments,
} from "./parsePatchGroup";

const FILE_A = [
	"diff --git a/a.ts b/a.ts",
	"index 0000001..0000002 100644",
	"--- a/a.ts",
	"+++ b/a.ts",
	"@@ -1,2 +1,2 @@",
	" const shared = 1;",
	"-const a = 1;",
	"+const a = 2;",
	"",
].join("\n");

const FILE_B = [
	"diff --git a/b.ts b/b.ts",
	"index 0000003..0000004 100644",
	"--- a/b.ts",
	"+++ b/b.ts",
	"@@ -1,1 +1,2 @@",
	" const b = 1;",
	"+const added = 2;",
	"",
].join("\n");

const FILE_B_EDITED = FILE_B.replace("+const added = 2;", "+const added = 3;");

describe("splitPatchSegments", () => {
	test("cuts at every file header and keeps leading text on the first", () => {
		const segments = splitPatchSegments(`commit message\n${FILE_A}${FILE_B}`);
		expect(segments).toEqual([`commit message\n${FILE_A}`, FILE_B]);
		expect(splitPatchSegments("")).toEqual([]);
	});
});

describe("parsePatchGroup", () => {
	test("an unchanged section keeps its parsed object and key when a sibling changes", () => {
		const before = parsePatchGroup("group", {
			kind: "patch",
			patch: FILE_A + FILE_B,
			requestedPaths: ["a.ts", "b.ts"],
			requestedUntrackedPaths: [],
			whitespaceFiltered: false,
		});
		const after = parsePatchGroup(
			"group",
			{
				kind: "patch",
				patch: FILE_A + FILE_B_EDITED,
				requestedPaths: ["a.ts", "b.ts"],
				requestedUntrackedPaths: [],
				whitespaceFiltered: false,
			},
			before,
		);

		expect(after.byPath.get("a.ts")).toBe(before.byPath.get("a.ts"));
		expect(after.byPath.get("a.ts")?.cacheKey).toContain(
			buildContentKey("group", FILE_A),
		);
		expect(after.byPath.get("b.ts")).not.toBe(before.byPath.get("b.ts"));
		expect(after.byPath.get("b.ts")?.cacheKey).not.toBe(
			before.byPath.get("b.ts")?.cacheKey,
		);
		expect(after.bySegmentKey.size).toBe(2);
	});

	test("the same section in two groups gets two keys", () => {
		expect(buildContentKey("staged", FILE_A)).not.toBe(
			buildContentKey("unstaged", FILE_A),
		);
	});
});

describe("parsePatchGroup fallback files", () => {
	const files = [
		{
			path: "indent.ts",
			oldFile: { name: "indent.ts", contents: "if (a) {\nb();\n}\n" },
			newFile: { name: "indent.ts", contents: "if (a) {\n  b();\n}\n" },
		},
		{
			path: "edit.ts",
			oldFile: { name: "edit.ts", contents: "const a = 1;\n" },
			newFile: { name: "edit.ts", contents: "const a = 2;\n" },
		},
		{
			path: "mode.sh",
			oldFile: { name: "mode.sh", contents: "echo hi\n" },
			newFile: { name: "mode.sh", contents: "echo hi\n" },
		},
	];
	const result = {
		kind: "files" as const,
		files,
		requestedPaths: ["indent.ts", "edit.ts", "mode.sh"],
		requestedUntrackedPaths: [],
		whitespaceFiltered: false,
	};

	test("keeps whitespace-only files by default", () => {
		const parsed = parsePatchGroup("unstaged", result);
		expect(parsed.byPath.has("indent.ts")).toBe(true);
		expect(parsed.byPath.has("edit.ts")).toBe(true);
	});

	test("drops whitespace-only files when whitespace is ignored", () => {
		const parsed = parsePatchGroup("unstaged", result, undefined, {
			ignoreWhitespace: true,
		});
		expect(parsed.byPath.has("indent.ts")).toBe(false);
		expect(parsed.byPath.has("edit.ts")).toBe(true);
	});

	test("keeps a mode-only file when whitespace is ignored", () => {
		const parsed = parsePatchGroup("unstaged", result, undefined, {
			ignoreWhitespace: true,
		});
		expect(parsed.byPath.has("mode.sh")).toBe(true);
	});
});

describe("isWhitespaceOnly", () => {
	const base = {
		kind: "patch" as const,
		patch: "",
		requestedPaths: ["a.ts"],
		requestedUntrackedPaths: [],
	};
	const edited = { status: "modified" as const, additions: 2, deletions: 2 };

	test("a tracked file with line changes missing from a filtered patch", () => {
		expect(
			isWhitespaceOnly({ ...base, whitespaceFiltered: true }, edited),
		).toBe(true);
	});

	test("not when the patch was truncated or whitespace was kept", () => {
		expect(
			isWhitespaceOnly({ ...base, whitespaceFiltered: false }, edited),
		).toBe(false);
	});

	test("not for an untracked or a mode-only file", () => {
		const result = { ...base, whitespaceFiltered: true };
		expect(
			isWhitespaceOnly(result, { ...edited, status: "untracked" as const }),
		).toBe(false);
		expect(
			isWhitespaceOnly(result, { ...edited, additions: 0, deletions: 0 }),
		).toBe(false);
	});
});
