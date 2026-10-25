import { describe, expect, it } from "bun:test";
import {
	appendPastedText,
	countLines,
	firstLine,
	isLargePaste,
	normalizePastedText,
	parsePastedText,
} from "./pastedText";

const lines = (count: number) =>
	Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");

describe("isLargePaste", () => {
	it("collapses from 25 lines or 4,000 chars", () => {
		expect(isLargePaste(lines(24))).toBe(false);
		expect(isLargePaste(lines(25))).toBe(true);
		expect(isLargePaste("x".repeat(3999))).toBe(false);
		expect(isLargePaste("x".repeat(4000))).toBe(true);
	});

	it("leaves blank pastes and trailing newlines alone", () => {
		expect(isLargePaste("\n".repeat(30))).toBe(false);
		expect(isLargePaste(normalizePastedText(`${lines(24)}\n\n\n`))).toBe(false);
	});
});

describe("normalizePastedText", () => {
	it("uses LF and drops trailing newlines", () => {
		expect(normalizePastedText("a\r\nb\rc\n\n")).toBe("a\nb\nc");
	});
});

describe("card labels", () => {
	it("titles a paste by its first non-blank line", () => {
		expect(firstLine("\n  \n  TypeError: boom\n at x")).toBe("TypeError: boom");
		expect(countLines("a\nb\nc")).toBe(3);
	});
});

describe("appendPastedText", () => {
	it("sends each paste as a trailing block after the prompt", () => {
		expect(appendPastedText("Why does this crash?", ["a\nb", "c"])).toBe(
			[
				"Why does this crash?",
				"",
				'<pasted_text lines="2">',
				"a",
				"b",
				"</pasted_text>",
				"",
				'<pasted_text lines="1">',
				"c",
				"</pasted_text>",
			].join("\n"),
		);
		expect(appendPastedText("", ["c"])).toBe(
			'<pasted_text lines="1">\nc\n</pasted_text>',
		);
		expect(appendPastedText("just text", [])).toBe("just text");
	});
});

describe("parsePastedText", () => {
	it("round-trips the prompt and every paste", () => {
		const pastes = [lines(30), "x".repeat(4000), "  indented\n\n\ttabs"];
		const message = appendPastedText("Look at these\nplease", pastes);
		expect(parsePastedText(message)).toEqual({
			text: "Look at these\nplease",
			pastes,
		});
	});

	it("keeps a paste that contains the tags itself", () => {
		const inner = appendPastedText("nested", ["</pasted_text>\nmore"]);
		const paste = `before\n</pasted_text>\n${inner}`;
		expect(parsePastedText(appendPastedText("typed", [paste]))).toEqual({
			text: "typed",
			pastes: [paste],
		});
	});

	it("leaves text alone when no well-formed block trails it", () => {
		const broken = 'hi\n<pasted_text lines="3">\na\n</pasted_text>';
		expect(parsePastedText(broken)).toEqual({ text: broken, pastes: [] });
		const notTrailing = `${appendPastedText("hi", ["a"])}\nafter`;
		expect(parsePastedText(notTrailing)).toEqual({
			text: notTrailing,
			pastes: [],
		});
	});
});
