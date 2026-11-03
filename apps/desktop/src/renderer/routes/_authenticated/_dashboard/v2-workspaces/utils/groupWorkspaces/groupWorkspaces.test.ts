import { describe, expect, test } from "bun:test";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	GROUP_KEY_ARCHIVED,
	GROUP_KEY_CLOUD,
	GROUP_KEY_SESSIONS,
	GROUP_KEY_UNKNOWN_CREATOR,
	groupWorkspaces,
} from "./groupWorkspaces";

let counter = 0;
function make(
	overrides: Partial<AccessibleV2Workspace> = {},
): AccessibleV2Workspace {
	counter += 1;
	return {
		id: `ws-${counter}`,
		name: `Workspace ${counter}`,
		branch: `branch-${counter}`,
		type: "worktree",
		createdAt: new Date(1_000 * counter),
		createdByUserId: "user-a",
		createdByName: "Ada",
		createdByImage: null,
		isCreatedByCurrentUser: false,
		projectId: "project-a",
		projectName: "Alpha",
		projectIconUrl: null,
		hostId: "host-1",
		hostName: "Laptop",
		hostIsOnline: true,
		hostType: "local-device",
		isInSidebar: false,
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

const options = {
	orderBy: "activity" as const,
	showArchived: false,
};

describe("groupWorkspaces", () => {
	test("status grouping walks the buckets urgency-first and skips empty ones", () => {
		const sections = groupWorkspaces(
			[
				make({ agentStatus: "idle" }),
				make({ agentStatus: "working" }),
				make({ agentStatus: "permission" }),
			],
			{ ...options, groupBy: "status" },
		);
		expect(sections.map((section) => section.key)).toEqual([
			"attention",
			"working",
			"idle",
		]);
		expect(sections[0].column).toBe("attention");
	});

	test("archived rows are dropped unless showArchived is on", () => {
		const rows = [make(), make({ archivedAt: 1, archiveReason: "deleted" })];
		expect(
			groupWorkspaces(rows, { ...options, groupBy: "status" }).map(
				(section) => section.key,
			),
		).toEqual(["idle"]);
		expect(
			groupWorkspaces(rows, {
				...options,
				groupBy: "status",
				showArchived: true,
			}).map((section) => section.key),
		).toEqual(["idle", "deleted"]);
	});

	test("project grouping puts sessions last and busiest project first", () => {
		const sections = groupWorkspaces(
			[
				make({ projectId: null, projectName: null, lastAgentEventAt: 9_000 }),
				make({
					projectId: "project-b",
					projectName: "Beta",
					lastAgentEventAt: 5_000,
				}),
				make({ projectId: "project-a", lastAgentEventAt: 8_000 }),
			],
			{ ...options, groupBy: "project" },
		);
		expect(sections.map((section) => section.key)).toEqual([
			"project-a",
			"project-b",
			GROUP_KEY_SESSIONS,
		]);
		expect(sections[0].column).toBeNull();
		expect(sections[0].sample.projectName).toBe("Alpha");
	});

	test("where grouping folds every cloud row into one section", () => {
		const sections = groupWorkspaces(
			[
				make({ hostType: "cloud", hostId: "cloud-1" }),
				make({ hostType: "cloud", hostId: "cloud-2" }),
				make({ hostId: "host-1" }),
			],
			{ ...options, groupBy: "where" },
		);
		expect(
			sections.map((section) => [section.key, section.workspaces.length]),
		).toEqual([
			["host-1", 1],
			[GROUP_KEY_CLOUD, 2],
		]);
	});

	test("creator grouping puts unknown creators last", () => {
		const sections = groupWorkspaces(
			[
				make({
					createdByUserId: null,
					createdByName: null,
					lastAgentEventAt: 9_000,
				}),
				make({
					createdByUserId: "user-b",
					createdByName: "Bo",
					lastAgentEventAt: 1_000,
				}),
			],
			{ ...options, groupBy: "creator" },
		);
		expect(sections.map((section) => section.key)).toEqual([
			"user-b",
			GROUP_KEY_UNKNOWN_CREATOR,
		]);
	});

	test("section order follows latest activity even when rows sort by name", () => {
		const sections = groupWorkspaces(
			[
				make({ projectId: "project-a", name: "zulu", lastAgentEventAt: 1_000 }),
				make({
					projectId: "project-b",
					projectName: "Beta",
					name: "alpha",
					lastAgentEventAt: 500,
				}),
				make({
					projectId: "project-b",
					projectName: "Beta",
					name: "yankee",
					lastAgentEventAt: 9_000,
				}),
			],
			{ ...options, groupBy: "project", orderBy: "name" },
		);
		expect(sections.map((section) => section.key)).toEqual([
			"project-b",
			"project-a",
		]);
		expect(sections[0].workspaces.map((w) => w.name)).toEqual([
			"alpha",
			"yankee",
		]);
	});

	test("archived rows form their own last section outside status grouping", () => {
		const rows = [
			make({ archivedAt: 1, archiveReason: "merged", lastAgentEventAt: 9_000 }),
			make({ lastAgentEventAt: 1_000 }),
			make({
				projectId: "project-b",
				projectName: "Beta",
				lastAgentEventAt: 2_000,
			}),
		];
		expect(
			groupWorkspaces(rows, {
				...options,
				groupBy: "none",
				showArchived: true,
			}).map((section) => [section.key, section.workspaces.length]),
		).toEqual([
			["all", 2],
			[GROUP_KEY_ARCHIVED, 1],
		]);
		expect(
			groupWorkspaces(rows, {
				...options,
				groupBy: "project",
				showArchived: true,
			}).map((section) => section.key),
		).toEqual(["project-b", "project-a", GROUP_KEY_ARCHIVED]);
	});

	test("rows inside a section follow the chosen ordering", () => {
		const sections = groupWorkspaces(
			[
				make({ name: "bravo", createdAt: new Date(1) }),
				make({ name: "Alpha", createdAt: new Date(2) }),
			],
			{ ...options, groupBy: "none", orderBy: "name" },
		);
		expect(sections).toHaveLength(1);
		expect(sections[0].workspaces.map((workspace) => workspace.name)).toEqual([
			"Alpha",
			"bravo",
		]);
	});
});
