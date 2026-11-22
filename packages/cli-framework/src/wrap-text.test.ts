import { expect, test } from "bun:test";
import { wrapText } from "./wrap-text";

test("wrapText breaks at spaces, never inside a word", () => {
	expect(wrapText("private repos will not clone there", 20)).toBe(
		"private repos will\nnot clone there",
	);
});
