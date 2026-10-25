import { describe, expect, it } from "bun:test";
import type {
	DashboardSidebarProject,
	DashboardSidebarWorkspace,
} from "../../types";
import { stabilizeDashboardSidebarProjects } from "./stabilizeDashboardSidebarProjects";

const DATE = new Date("2026-01-01T00:00:00.000Z");

function makeWorkspace(
	overrides: Partial<DashboardSidebarWorkspace> = {},
): DashboardSidebarWorkspace {
	return {
		id: "workspace-1",
		projectId: "project-1",
		hostId: "machine-1",
		hostType: "local-device",
		type: "worktree",
		hostIsOnline: true,
		accentColor: null,
		name: "Workspace",
		branch: "main",
		pullRequest: null,
		repoUrl: null,
		branchExistsOnRemote: false,
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: DATE,
		updatedAt: DATE,
		lastActivityAt: null,
		taskId: null,
		isPinned: false,
		pendingTransaction: null,
		isMine: true,
		sandboxStatus: null,
		...overrides,
	};
}

function makeProject(
	workspaces: DashboardSidebarWorkspace[],
	grouped: DashboardSidebarWorkspace[] = [],
): DashboardSidebarProject {
	return {
		id: "project-1",
		name: "Project",
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		color: null,
		createdAt: DATE,
		updatedAt: DATE,
		isCollapsed: false,
		children: [
			...workspaces.map((workspace) => ({
				type: "workspace" as const,
				workspace,
			})),
			...(grouped.length > 0
				? [
						{
							type: "section" as const,
							section: {
								id: "project-1:folder",
								projectId: "project-1",
								name: "folder",
								createdAt: DATE,
								isCollapsed: false,
								tabOrder: 1,
								color: null,
								workspaces: grouped,
							},
						},
					]
				: []),
		],
	};
}

const workspaceOf = (project: DashboardSidebarProject, id: string) =>
	project.children
		.flatMap((child) =>
			child.type === "workspace" ? [child.workspace] : child.section.workspaces,
		)
		.find((workspace) => workspace.id === id);

describe("stabilizeDashboardSidebarProjects", () => {
	it("keeps unchanged workspaces when a sibling leaves its folder", () => {
		const a = makeWorkspace({ id: "a" });
		const b = makeWorkspace({ id: "b", accentColor: "#ff0000" });
		const first = stabilizeDashboardSidebarProjects(
			[makeProject([a], [b])],
			null,
		);

		const second = stabilizeDashboardSidebarProjects(
			[makeProject([makeWorkspace({ id: "a" }), makeWorkspace({ id: "b" })])],
			first,
		);

		const [before] = first.projects;
		const [after] = second.projects;
		if (!before || !after) throw new Error("missing project");
		expect(after).not.toBe(before);
		expect(workspaceOf(after, "a")).toBe(workspaceOf(before, "a"));
		expect(workspaceOf(after, "b")).not.toBe(workspaceOf(before, "b"));
	});

	it("returns the previous list when nothing changed", () => {
		const first = stabilizeDashboardSidebarProjects(
			[makeProject([makeWorkspace()])],
			null,
		);
		const second = stabilizeDashboardSidebarProjects(
			[makeProject([makeWorkspace()])],
			first,
		);
		expect(second.projects).toBe(first.projects);
	});
});
