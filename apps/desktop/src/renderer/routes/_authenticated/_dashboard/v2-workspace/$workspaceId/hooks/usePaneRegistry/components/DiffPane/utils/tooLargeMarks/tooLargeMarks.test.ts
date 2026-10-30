import { describe, expect, test } from "bun:test";
import { type CodeViewItem, parsePatchFiles } from "@pierre/diffs";
import { findItemIdForDiff, pruneTooLargeMarks } from "./tooLargeMarks";

function diffFor(contents: string) {
	const fileDiff = parsePatchFiles(
		`diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n@@ -1 +1 @@\n-old\n+${contents}\n`,
	)[0]?.files[0];
	if (!fileDiff) throw new Error("patch did not parse");
	return fileDiff;
}

const staged = diffFor("staged");
const unstaged = diffFor("unstaged");
const items: CodeViewItem<undefined>[] = [
	{ id: "diff:staged:big.ts", type: "diff", fileDiff: staged },
	{ id: "diff:unstaged:big.ts", type: "diff", fileDiff: unstaged },
];

describe("findItemIdForDiff", () => {
	test("tells apart two items for the same path", () => {
		expect(findItemIdForDiff(items, unstaged)).toBe("diff:unstaged:big.ts");
		expect(findItemIdForDiff(items, staged)).toBe("diff:staged:big.ts");
	});
});

describe("pruneTooLargeMarks", () => {
	test("keeps a mark while its item shows the same diff", () => {
		const marks = new Map([["diff:staged:big.ts", staged]]);
		expect(pruneTooLargeMarks(marks, items)).toBe(marks);
	});

	test("drops a mark once the item's diff changes or the item leaves", () => {
		const marks = new Map([
			["diff:staged:big.ts", staged],
			["diff:unstaged:big.ts", unstaged],
		]);
		const next = pruneTooLargeMarks(marks, [
			{ id: "diff:staged:big.ts", type: "diff", fileDiff: diffFor("edited") },
		]);
		expect(next.size).toBe(0);
	});
});
