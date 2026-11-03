import { describe, expect, test } from "bun:test";
import type { AvailableCommand } from "@superset/chat/protocol";
import { textElementsFromText } from "./textElementsFromText";

describe("textElementsFromText", () => {
	test("a replayed message gets its MCP chips back, at byte offsets", () => {
		expect(textElementsFromText("é @mcp/hyper do it", undefined)).toEqual([
			{ byteRange: { start: 3, end: 13 }, elementKind: "other" },
		]);
	});

	test("a skill the session lists is a chip wherever the message names it", () => {
		const commands = new Map([
			["superset:environment", { name: "superset:environment" }],
		]) as ReadonlyMap<string, AvailableCommand>;
		expect(
			textElementsFromText(
				"Use the superset:environment skill, not superset:other or https://x.sh",
				commands,
			),
		).toEqual([
			{ byteRange: { start: 8, end: 28 }, elementKind: "slash_command" },
		]);
	});
});
