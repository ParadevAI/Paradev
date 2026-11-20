import { describe, expect, test } from "bun:test";
import { matchRanges } from "./matchRanges";

describe("matchRanges", () => {
	test("finds a substring, word prefixes, and nothing when offsets would drift", () => {
		expect(matchRanges("Release notes card", "NOTES")).toEqual([[8, 13]]);
		expect(matchRanges("Release notes card", "rel not")).toEqual([
			[0, 3],
			[8, 11],
		]);
		expect(matchRanges("Release notes card", "rel xyz")).toEqual([]);
		expect(matchRanges("Release notes card", "  ")).toEqual([]);
		expect(matchRanges("İstanbul notes", "notes")).toEqual([]);
	});
});
