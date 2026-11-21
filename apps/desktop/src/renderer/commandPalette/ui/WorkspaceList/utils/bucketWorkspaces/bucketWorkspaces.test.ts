import { describe, expect, test } from "bun:test";
import { bucketWorkspaces, rankSwitcherRows } from "./bucketWorkspaces";

const AT = new Date("2026-11-03T10:00:00Z").getTime();

function workspace(
	id: string,
	overrides: Partial<Parameters<typeof bucketWorkspaces>[0][number]> = {},
) {
	return {
		id,
		name: id,
		branch: `${id}-branch`,
		projectName: "paradev",
		hostName: "Mac",
		agentStatus: "idle" as const,
		lastAgentEventAt: null,
		createdAt: new Date(AT - 86_400_000),
		pr: null,
		...overrides,
	};
}

describe("bucketWorkspaces", () => {
	test("orders needs-input, completed, running, then the rest", () => {
		const groups = bucketWorkspaces(
			[
				workspace("idle"),
				workspace("working", { agentStatus: "working" }),
				workspace("failed", { agentStatus: "failed" }),
				workspace("review", { agentStatus: "review" }),
				workspace("permission", { agentStatus: "permission" }),
			],
			null,
		);
		expect(groups.map((group) => group.bucket)).toEqual([
			"needsInput",
			"completed",
			"running",
			"recent",
		]);
		expect(groups[1]?.rows.map((row) => row.workspace.id)).toEqual([
			"failed",
			"review",
		]);
	});

	test("newest activity first within a bucket", () => {
		const groups = bucketWorkspaces(
			[
				workspace("old", { lastAgentEventAt: AT - 60_000 }),
				workspace("new", { lastAgentEventAt: AT }),
			],
			null,
		);
		expect(groups[0]?.rows.map((row) => row.workspace.id)).toEqual([
			"new",
			"old",
		]);
	});

	test("the current workspace leads recent whatever its status", () => {
		const groups = bucketWorkspaces(
			[
				workspace("here", { agentStatus: "permission" }),
				workspace("there", { lastAgentEventAt: AT }),
			],
			"here",
		);
		expect(groups.map((group) => group.bucket)).toEqual(["recent"]);
		expect(groups[0]?.rows[0]).toMatchObject({
			isCurrent: true,
			workspace: { id: "here" },
		});
	});

	test("drops empty buckets", () => {
		const groups = bucketWorkspaces([workspace("only")], null);
		expect(groups.map((group) => group.bucket)).toEqual(["recent"]);
	});
});

describe("rankSwitcherRows", () => {
	const groups = bucketWorkspaces(
		[
			workspace("relay-tunnel", { name: "relay-tunnel-1006-drops" }),
			workspace("release", {
				name: "Release notes card",
				agentStatus: "working",
			}),
			workspace("review", {
				name: "PR #9296 review",
				agentStatus: "permission",
				pr: { prNumber: 9296, title: "launch prompt on chat resume" },
			}),
			workspace("other", { name: "Pinned pages", branch: "sidebar-pins" }),
		],
		null,
	);

	test("no query keeps the bucket order", () => {
		expect(rankSwitcherRows(groups, "").map((row) => row.workspace.id)).toEqual(
			["review", "release", "relay-tunnel", "other"],
		);
	});

	test("a title prefix beats a word prefix, ties keep the switcher order", () => {
		expect(
			rankSwitcherRows(groups, "re").map((row) => row.workspace.id),
		).toEqual(["release", "relay-tunnel", "review"]);
	});

	test("matches branch and PR number as keywords", () => {
		expect(
			rankSwitcherRows(groups, "sidebar").map((row) => row.workspace.id),
		).toEqual(["other"]);
		expect(
			rankSwitcherRows(groups, "#9296").map((row) => row.workspace.id),
		).toEqual(["review"]);
	});
});
