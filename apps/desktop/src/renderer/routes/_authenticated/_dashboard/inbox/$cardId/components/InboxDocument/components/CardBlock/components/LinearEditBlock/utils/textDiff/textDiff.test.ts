import { describe, expect, test } from "bun:test";
import { diffLines } from "./textDiff";

const shape = (before: string, after: string) =>
	diffLines(before, after).map(
		(line) =>
			`${line.kind} ${line.words.map((word) => (word.changed ? `[${word.text}]` : word.text)).join("")}`,
	);

describe("diffLines", () => {
	test("equal texts are all the same", () => {
		expect(shape("a\nb", "a\nb")).toEqual(["same a", "same b"]);
	});

	test("an added line", () => {
		expect(shape("a\nc", "a\nb\nc")).toEqual(["same a", "added b", "same c"]);
	});

	test("a removed line", () => {
		expect(shape("a\nb\nc", "a\nc")).toEqual(["same a", "removed b", "same c"]);
	});

	test("a changed line is a removal then an addition, with the words that differ marked", () => {
		expect(shape("one two three", "one 2 three")).toEqual([
			"removed one [two] three",
			"added one [2] three",
		]);
	});

	test("lines changed together pair in order; the rest are whole lines", () => {
		expect(shape("a 1\nb 1\nz", "a 2\nb 2\nc 2\nz")).toEqual([
			"removed a [1]",
			"removed b [1]",
			"added a [2]",
			"added b [2]",
			"added c 2",
			"same z",
		]);
	});

	test("from nothing", () => {
		expect(shape("", "new")).toEqual(["removed ", "added [new]"]);
	});
});
