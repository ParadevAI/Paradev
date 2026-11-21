import { expect, test } from "bun:test";
import { largestIconFile } from "./extension-icon";

test("a question shows the extension's largest icon", () => {
	expect(
		largestIconFile({
			icons: {
				"16": "icons/16.png",
				"128": "icons/128.png",
				"48": "icons/48.png",
			},
		}),
	).toBe("icons/128.png");
	expect(largestIconFile({})).toBeUndefined();
});
