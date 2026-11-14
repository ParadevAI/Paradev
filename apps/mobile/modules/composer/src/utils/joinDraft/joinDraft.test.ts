import { describe, expect, test } from "bun:test";
import { joinDraft } from "./joinDraft";

describe("joinDraft", () => {
	test("puts a space between words", () => {
		expect(joinDraft("fix the", " bug ")).toBe("fix the bug");
	});

	test("adds nothing before punctuation or after a newline", () => {
		expect(joinDraft("done", ".")).toBe("done.");
		expect(joinDraft("first\n", "second")).toBe("first\nsecond");
	});

	test("does not space Japanese or Chinese", () => {
		expect(joinDraft("バグを", "直して")).toBe("バグを直して");
	});

	test("ignores an empty addition and an empty draft", () => {
		expect(joinDraft("keep", "  ")).toBe("keep");
		expect(joinDraft("", "start")).toBe("start");
	});
});
