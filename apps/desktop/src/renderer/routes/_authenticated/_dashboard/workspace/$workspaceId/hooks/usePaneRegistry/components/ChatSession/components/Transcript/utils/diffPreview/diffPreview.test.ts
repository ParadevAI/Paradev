import { describe, expect, test } from "bun:test";
import { diffPreviewLines } from "./diffPreview";

const diff = (oldText: string | null, newText: string) => ({
	type: "diff" as const,
	path: "src/app.ts",
	oldText,
	newText,
});

describe("diffPreviewLines", () => {
	test("starts one line before the first change and numbers each side", () => {
		expect(diffPreviewLines(diff("a\nb\nc\nd\n", "a\nB\nc\nd\ne\n"))).toEqual([
			{ kind: "context", number: 1, text: "a" },
			{ kind: "del", number: 2, text: "b" },
			{ kind: "add", number: 2, text: "B" },
			{ kind: "context", number: 3, text: "c" },
			{ kind: "context", number: 4, text: "d" },
			{ kind: "add", number: 5, text: "e" },
		]);
	});

	test("skips unchanged lines before the first change and stops at six", () => {
		const unchanged = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
		const changed = [...unchanged];
		changed.splice(
			30,
			0,
			"new 1",
			"new 2",
			"new 3",
			"new 4",
			"new 5",
			"new 6",
			"new 7",
		);
		const lines = diffPreviewLines(
			diff(`${unchanged.join("\n")}\n`, `${changed.join("\n")}\n`),
		);
		expect(lines).toHaveLength(6);
		expect(lines?.[0]).toEqual({
			kind: "context",
			number: 30,
			text: "line 30",
		});
		expect(lines?.[1]).toEqual({ kind: "add", number: 31, text: "new 1" });
		expect(lines?.[5]).toEqual({ kind: "add", number: 35, text: "new 5" });
	});

	test("a new file is all additions from line one", () => {
		expect(diffPreviewLines(diff(null, "x\ny\n"))).toEqual([
			{ kind: "add", number: 1, text: "x" },
			{ kind: "add", number: 2, text: "y" },
		]);
	});

	test("an emptied file is all deletions", () => {
		expect(diffPreviewLines(diff("x\ny\n", ""))).toEqual([
			{ kind: "del", number: 1, text: "x" },
			{ kind: "del", number: 2, text: "y" },
		]);
	});

	test("no change gives no lines, and a huge file gives up", () => {
		expect(diffPreviewLines(diff("same\n", "same\n"))).toEqual([]);
		expect(diffPreviewLines(diff("x".repeat(400_001), "y"))).toBeNull();
	});

	test("caps a long line", () => {
		const long = "z".repeat(200);
		expect(diffPreviewLines(diff(null, `${long}\n`))?.[0]?.text).toBe(
			`${"z".repeat(120)}…`,
		);
	});
});
