import { expect, test } from "bun:test";
import { languageDisplay } from "./languageDisplay";

test("names a known language and gives it a file to take its icon from", () => {
	expect(languageDisplay("ts")).toEqual({
		label: "TypeScript",
		iconFileName: "code.ts",
	});
	expect(languageDisplay("typescript")).toEqual(languageDisplay("ts"));
	expect(languageDisplay("zsh")).toEqual({
		label: "Shell",
		iconFileName: "code.sh",
	});
	expect(languageDisplay("c++").label).toBe("C++");
});

test("plain text and an unmarked fence have no label of their own", () => {
	for (const language of [null, "text", "txt", "plaintext"]) {
		expect(languageDisplay(language)).toEqual({
			label: null,
			iconFileName: null,
		});
	}
});

test("an unknown language keeps its own name", () => {
	expect(languageDisplay("zig")).toEqual({
		label: "zig",
		iconFileName: "code.zig",
	});
	expect(languageDisplay("python:3")).toEqual({
		label: "python:3",
		iconFileName: null,
	});
});
