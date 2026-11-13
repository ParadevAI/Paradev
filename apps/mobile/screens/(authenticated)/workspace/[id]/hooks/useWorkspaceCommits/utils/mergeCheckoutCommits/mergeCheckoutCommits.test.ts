import { describe, expect, test } from "bun:test";
import { mergeCheckoutCommits } from "./mergeCheckoutCommits";

const target = (repositoryId: string, name: string | null) => ({
	repositoryId,
	name,
	path: `/ws/${name ?? ""}`,
	isPrimary: repositoryId === "r1",
});

describe("mergeCheckoutCommits", () => {
	test("one checkout keeps the host's order", () => {
		const commits = mergeCheckoutCommits([
			{
				target: target("r1", null),
				commits: [
					{ hash: "a", date: "2026-01-01T00:00:00Z" },
					{ hash: "b", date: "2026-02-01T00:00:00Z" },
				],
			},
		]);
		expect(commits.map((commit) => commit.key)).toEqual(["r1:a", "r1:b"]);
	});

	test("several checkouts interleave newest first and keep their repository", () => {
		const commits = mergeCheckoutCommits([
			{
				target: target("r1", "api"),
				commits: [{ hash: "a", date: "2026-01-01T00:00:00Z" }],
			},
			{
				target: target("r2", "web"),
				commits: [{ hash: "a", date: "2026-03-01T00:00:00Z" }],
			},
		]);
		expect(commits.map((commit) => [commit.key, commit.checkoutName])).toEqual([
			["r2:a", "web"],
			["r1:a", "api"],
		]);
	});
});
