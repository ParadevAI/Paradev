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

	test("a command the session lists is a chip mid-sentence", () => {
		const commands = new Map([
			["code-review", { name: "code-review" }],
		]) as ReadonlyMap<string, AvailableCommand>;
		expect(
			textElementsFromText("é then do /code-review, not /usr/bin", commands),
		).toEqual([
			{ byteRange: { start: 11, end: 23 }, elementKind: "slash_command" },
		]);
	});

	test("a Codex $ skill is a chip at the start or mid-sentence, not $HOME", () => {
		const commands = new Map([
			["$find-skills", { name: "$find-skills" }],
		]) as ReadonlyMap<string, AvailableCommand>;
		expect(
			textElementsFromText(
				"$find-skills, then $find-skills in $HOME",
				commands,
			),
		).toEqual([
			{ byteRange: { start: 0, end: 12 }, elementKind: "slash_command" },
			{ byteRange: { start: 19, end: 31 }, elementKind: "slash_command" },
		]);
	});
});
