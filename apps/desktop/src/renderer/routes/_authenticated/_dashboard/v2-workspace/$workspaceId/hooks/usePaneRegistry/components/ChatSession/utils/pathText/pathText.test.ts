import { describe, expect, test } from "bun:test";
import { isLocalPathText, pathFileName, stripLocation } from "./pathText";

describe("pathFileName", () => {
	test.each([
		["src/app.ts", "app.ts"],
		["app.ts", "app.ts"],
		["packages/chat/src/acpAdapter.ts:994", "acpAdapter.ts"],
		["src/app.ts:12:4", "app.ts"],
		["src/app.ts#L12", "app.ts"],
		["src/app.ts#L12-L20", "app.ts"],
		["src/app.ts#L12C3", "app.ts"],
		["/Users/me/repo/README.md", "README.md"],
		["~/notes/todo.txt", "todo.txt"],
		["file:///tmp/a.ts", "a.ts"],
		["src\\win\\app.tsx", "app.tsx"],
		["Dockerfile", "Dockerfile"],
		["docker/Makefile:3", "Makefile"],
		["Gemfile", "Gemfile"],
		["LICENSE", "LICENSE"],
		[".env.local", ".env.local"],
		["types.d.ts", "types.d.ts"],
		["app/(dashboard)/page.tsx", "page.tsx"],
		["  src/app.ts  ", "app.ts"],
	])("%s names %s", (text, fileName) => {
		expect(pathFileName(text)).toBe(fileName);
	});

	test.each([
		[""],
		["useState"],
		["bun run typecheck"],
		["src/components/"],
		["src/components"],
		[".git/"],
		[".git"],
		["v1.2"],
		["e.g."],
		["foo.bar()"],
		["a|b.ts"],
		["name.averyveryverylongextension"],
		[`${"a/".repeat(120)}b.ts`],
	])("%s is not a path", (text) => {
		expect(pathFileName(text)).toBeNull();
	});
});

test("stripLocation drops only a trailing line position", () => {
	expect(stripLocation("src/app.ts:12:4")).toBe("src/app.ts");
	expect(stripLocation("src/app.ts#L12-L20")).toBe("src/app.ts");
	expect(stripLocation("src/app.ts")).toBe("src/app.ts");
	expect(stripLocation("12:20:src/app.ts")).toBe("12:20:src/app.ts");
});

test("isLocalPathText keeps file URLs and refuses other schemes", () => {
	expect(isLocalPathText("src/app.ts:12")).toBe(true);
	expect(isLocalPathText("file:///tmp/a.ts")).toBe(true);
	expect(isLocalPathText("https://example.com/a.ts")).toBe(false);
});
