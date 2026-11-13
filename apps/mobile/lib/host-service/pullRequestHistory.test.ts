import { describe, expect, test } from "bun:test";
import type { WorkspacePullRequestHistory } from "./client";
import { flattenPullRequestHistory } from "./pullRequestHistory";

const history = (
	checkouts: WorkspacePullRequestHistory["checkouts"],
): WorkspacePullRequestHistory => ({ workspaceId: "ws", checkouts });

const entry = (
	repoName: string,
	number: number,
	isCurrent: boolean,
	linkedAt: number,
) => ({
	repoOwner: "acme",
	repoName,
	number,
	url: `https://github.com/acme/${repoName}/pull/${number}`,
	title: `PR ${number}`,
	state: "open" as const,
	isDraft: false,
	headBranch: "feature",
	reviewDecision: "pending" as const,
	checksStatus: "pending" as const,
	mergedAt: null,
	updatedAt: linkedAt,
	linkedAt,
	isCurrent,
});

const checkouts = [
	{ repositoryId: "r-api", name: "api", isPrimary: false },
	{ repositoryId: "r-web", name: "web", isPrimary: true },
];

describe("flattenPullRequestHistory", () => {
	test("one checkout puts the current PR first, then newest link first", () => {
		const rows = flattenPullRequestHistory(
			history([
				{
					repositoryId: "r-api",
					pullRequests: [
						entry("api", 1, false, 2),
						entry("api", 2, false, 5),
						entry("api", 3, true, 1),
					],
				},
			]),
			[checkouts[0] as (typeof checkouts)[number]],
		);
		expect(rows.map((row) => [row.prNumber, row.checkoutName])).toEqual([
			[3, null],
			[2, null],
			[1, null],
		]);
	});

	test("several checkouts lead with current PRs, the primary's first", () => {
		const rows = flattenPullRequestHistory(
			history([
				{
					repositoryId: "r-api",
					pullRequests: [entry("api", 7, true, 1), entry("api", 6, false, 9)],
				},
				{
					repositoryId: "r-web",
					pullRequests: [entry("web", 3, true, 2), entry("web", 2, false, 4)],
				},
			]),
			checkouts,
		);
		expect(
			rows.map((row) => [row.checkoutName, row.prNumber, row.isCurrent]),
		).toEqual([
			["web", 3, true],
			["api", 7, true],
			["api", 6, false],
			["web", 2, false],
		]);
	});

	test("a host that predates checkouts files its flat list under the primary", () => {
		const legacy = {
			workspaceId: "ws",
			pullRequests: [entry("web", 4, true, 1)],
		} as unknown as WorkspacePullRequestHistory;
		const rows = flattenPullRequestHistory(legacy, checkouts);
		expect(rows.map((row) => [row.repositoryId, row.prNumber])).toEqual([
			["r-web", 4],
		]);
	});
});
