import { describe, expect, test } from "bun:test";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	channelTag,
	countChannelAgents,
	deriveChannelAgentState,
	selectChannelAgents,
} from "./channelAgents";

function workspace(
	overrides: Partial<AccessibleV2Workspace> & { id: string },
): AccessibleV2Workspace {
	return {
		name: overrides.id,
		branch: overrides.id,
		type: "worktree",
		createdAt: new Date(0),
		createdByUserId: null,
		createdByName: null,
		createdByImage: null,
		isCreatedByCurrentUser: true,
		projectId: "p",
		projectName: "p",
		projectIconUrl: null,
		hostId: "h",
		hostName: "h",
		hostIsOnline: true,
		hostType: "local-device",
		isInSidebar: true,
		pr: null,
		agentStatus: "idle",
		lastAgentEventAt: null,
		diffStats: null,
		sandboxStatus: null,
		seenMarks: { terminals: [], reportedAt: null },
		archivedAt: null,
		archiveReason: null,
		...overrides,
	};
}

const pr = (state: "open" | "merged") => ({
	prNumber: 1,
	title: "t",
	url: "https://github.com/o/r/pull/1",
	state,
	checksStatus: "none" as const,
	reviewDecision: "pending" as const,
	checks: [],
	mergedAt: null,
});

describe("channelTag", () => {
	test("is the channel name as the host stores tags", () => {
		expect(channelTag(" Desktop-Shell ")).toBe("desktop-shell");
	});
});

describe("deriveChannelAgentState", () => {
	test("an agent asking for permission waits on you", () => {
		expect(
			deriveChannelAgentState(
				workspace({ id: "a", agentStatus: "permission" }),
			),
		).toBe("waiting");
	});
	test("a finished agent waits on you until opened; an open PR is ready for review", () => {
		expect(
			deriveChannelAgentState(workspace({ id: "a", agentStatus: "review" })),
		).toBe("waiting");
		expect(
			deriveChannelAgentState(workspace({ id: "a", pr: pr("open") })),
		).toBe("review");
	});
	test("a merged PR is done", () => {
		expect(
			deriveChannelAgentState(workspace({ id: "a", pr: pr("merged") })),
		).toBe("done");
	});
});

describe("selectChannelAgents", () => {
	test("keeps the workspaces tagged with the channel, newest event first", () => {
		const agents = selectChannelAgents(
			[
				workspace({ id: "old", lastAgentEventAt: 1 }),
				workspace({ id: "other" }),
				workspace({ id: "new", lastAgentEventAt: 2 }),
			],
			new Map([
				["old", ["desktop-shell"]],
				["other", ["support"]],
				["new", ["desktop-shell", "support"]],
			]),
			"Desktop-Shell",
		);
		expect(agents.map((agent) => agent.workspace.id)).toEqual(["new", "old"]);
	});
});

describe("countChannelAgents", () => {
	test("counts waiting and working agents under every tag they carry", () => {
		const counts = countChannelAgents(
			[
				workspace({ id: "a", agentStatus: "working" }),
				workspace({ id: "b", agentStatus: "failed" }),
				workspace({ id: "c", agentStatus: "review" }),
			],
			new Map([
				["a", ["x", "y"]],
				["b", ["x"]],
				["c", ["x"]],
			]),
		);
		expect(counts.get("x")).toEqual({ waiting: 2, working: 1 });
		expect(counts.get("y")).toEqual({ waiting: 0, working: 1 });
	});
});
