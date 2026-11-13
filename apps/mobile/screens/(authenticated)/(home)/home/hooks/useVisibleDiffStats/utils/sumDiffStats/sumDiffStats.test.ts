import { describe, expect, test } from "bun:test";
import type { GitStatusSnapshot } from "@/lib/host-service/client";
import { diffStatsQueryKey, sumDiffStats } from "./sumDiffStats";

const status = (additions: number, deletions: number) =>
	({
		againstBase: [],
		staged: [],
		unstaged: [{ path: "x.ts", status: "modified", additions, deletions }],
	}) as unknown as GitStatusSnapshot;

const checkout = (repositoryId: string, name: string) => ({
	repositoryId,
	name,
	isPrimary: repositoryId === "r1",
	path: `/ws/${name}`,
	branch: "main",
	headSha: null,
	upstream: null,
	pullRequestId: null,
});

describe("sumDiffStats", () => {
	test("sums only the current checkouts on the current host", () => {
		const result = sumDiffStats({
			cached: [
				[diffStatsQueryKey("host-a", "ws", "r1"), status(1, 2)],
				[diffStatsQueryKey("host-a", "ws", "r2"), status(10, 20)],
				[diffStatsQueryKey("host-a", "ws", "r-removed"), status(100, 100)],
				[diffStatsQueryKey("host-old", "ws", "r1"), status(1000, 1000)],
			],
			workspacesById: new Map([
				[
					"ws",
					{
						hostId: "a",
						worktreePath: "/ws",
						checkouts: [checkout("r1", "api"), checkout("r2", "web")],
					},
				],
			]),
			resolveHostUrl: (hostId) => `host-${hostId}`,
		});
		expect(result.get("ws")).toEqual({ additions: 11, deletions: 22 });
	});

	test("a workspace with nothing cached has no stats", () => {
		const result = sumDiffStats({
			cached: [],
			workspacesById: new Map([
				["ws", { hostId: "a", worktreePath: "/ws", checkouts: [] }],
			]),
			resolveHostUrl: (hostId) => `host-${hostId}`,
		});
		expect(result.has("ws")).toBe(false);
	});
});
