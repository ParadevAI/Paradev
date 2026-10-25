import { describe, expect, test } from "bun:test";
import { textElementsFromText } from "./textElementsFromText";

describe("textElementsFromText", () => {
	test("a replayed message gets its MCP chips back, at byte offsets", () => {
		expect(textElementsFromText("é @mcp/hyper do it", undefined)).toEqual([
			{ byteRange: { start: 3, end: 13 }, elementKind: "other" },
		]);
	});
});
