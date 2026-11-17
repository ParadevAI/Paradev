import { describe, expect, test } from "bun:test";
import { filterChangedFiles } from "./filterChangedFiles";

function file(path: string, oldPath?: string) {
	return { path, oldPath };
}

describe("filterChangedFiles", () => {
	const files = [
		file("apps/desktop/src/Sidebar.tsx"),
		file("apps/web/src/page.ts"),
		file("README.md"),
	];

	test("returns everything for an empty or whitespace query", () => {
		expect(filterChangedFiles(files, "")).toEqual(files);
		expect(filterChangedFiles(files, "   ")).toEqual(files);
	});

	test("matches case-insensitively anywhere in the path", () => {
		expect(filterChangedFiles(files, "SIDEBAR")).toEqual([files[0]]);
		expect(filterChangedFiles(files, "src")).toEqual([files[0], files[1]]);
	});

	test("requires every whitespace-separated term to match", () => {
		expect(filterChangedFiles(files, "src tsx")).toEqual([files[0]]);
		expect(filterChangedFiles(files, "src missing")).toEqual([]);
	});

	test("matches a rename by its old path", () => {
		const renamed = file("apps/new/Name.tsx", "apps/old/Legacy.tsx");
		expect(filterChangedFiles([renamed], "legacy")).toEqual([renamed]);
	});

	test("terms never match across the path/oldPath boundary", () => {
		const renamed = file("a.ts", "b.ts");
		expect(filterChangedFiles([renamed], "a.tsb.ts")).toEqual([]);
	});
});
