import { describe, expect, test } from "bun:test";
import { findLandedMergeTime } from "./landed-merge";

describe("findLandedMergeTime", () => {
	test("matches only a subject line that ends with the PR number", () => {
		const commits = [
			{
				message: 'Revert "Keep small roof faces (#309)" (#320)',
				date: "2026-11-13T09:00:00Z",
			},
			{
				message: "Join a wing (#308)\n\nFollows up on (#309)",
				date: "2026-11-13T07:11:05Z",
			},
			{
				message: "Keep small roof faces (#3090)",
				date: "2026-11-13T07:15:00Z",
			},
			{
				message: "Keep small roof faces (#309)\n\nBody",
				date: "2026-11-13T07:16:57Z",
			},
		];

		expect(findLandedMergeTime(commits, 309)).toBe(
			Date.parse("2026-11-13T07:16:57Z"),
		);
		expect(findLandedMergeTime(commits.slice(0, 3), 309)).toBeNull();
	});
});
