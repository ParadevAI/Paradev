import type { TagFolderSettingInput } from "@superset/shared/workspace-tag-folders";
import type { HostProjectItem } from "@/hooks/useHostProjects";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import type { WorkspaceSort } from "../../stores/workspacesFilterStore/workspacesFilterStore";
import type { HomeListItem, ProjectGroups } from "../../types";
import { groupByTagFolder } from "../groupByTagFolder";
import { orderProjectChildren } from "../orderProjectChildren";
import { strongestAttention } from "../strongestAttention";

export const NO_PROJECT_SECTION_ID = "__none";

export interface HostSectionInput {
	machineId: string;
	workspaces: readonly HostWorkspaceItem[];
	projects: readonly HostProjectItem[];
	tagSettings: readonly TagFolderSettingInput[];
	/** Cached rows of a host that is not answering: shown, not actionable. */
	offline: boolean;
}

export interface HostSectionOptions {
	sort: WorkspaceSort;
	pinnedAt: Readonly<Record<string, number>>;
	activityTs: (workspace: HostWorkspaceItem) => number;
	rowAttention: (workspace: HostWorkspaceItem) => TerminalAttention | null;
	isCollapsed: (machineId: string, key: string) => boolean;
	noProjectName: string;
}

/** One host's projects, groups and rows, as Home lists a single machine. */
export function buildHostSection(
	{ machineId, workspaces, projects, tagSettings, offline }: HostSectionInput,
	{
		sort,
		pinnedAt,
		activityTs,
		rowAttention,
		isCollapsed,
		noProjectName,
	}: HostSectionOptions,
): HomeListItem[] {
	const items: HomeListItem[] = [];

	// Pinned first (oldest pin leads, desktop's ordering), then newest.
	const byPinThenActivity = (a: HostWorkspaceItem, b: HostWorkspaceItem) => {
		const aPin = pinnedAt[a.id];
		const bPin = pinnedAt[b.id];
		if (aPin !== undefined || bPin !== undefined) {
			if (aPin === undefined) return 1;
			if (bPin === undefined) return -1;
			return aPin - bPin;
		}
		const diff = activityTs(b) - activityTs(a);
		return Number.isNaN(diff) ? a.name.localeCompare(b.name) : diff;
	};

	const hostRows = workspaces.filter(
		(workspace) => workspace.hostId === machineId,
	);
	// A record whose worktree folder is gone from the host's disk is a stale
	// shell nothing can run in — not worth a list slot.
	const pool = hostRows.filter(
		(workspace) => workspace.worktreeExists !== false,
	);

	// A project id the host no longer reports is as good as none: grouping
	// under it would render the workspace nowhere.
	const knownProjectIds = new Set(projects.map((project) => project.id));
	const byProject = new Map<string, HostWorkspaceItem[]>();
	for (const workspace of pool) {
		const projectId =
			workspace.projectId && knownProjectIds.has(workspace.projectId)
				? workspace.projectId
				: NO_PROJECT_SECTION_ID;
		const group = byProject.get(projectId);
		if (group) group.push(workspace);
		else byProject.set(projectId, [workspace]);
	}

	const sections = [
		...projects.map((project) => ({
			projectId: project.id,
			name: project.name,
			iconUrl: project.iconUrl,
			createdAt: project.createdAt,
		})),
		{
			projectId: NO_PROJECT_SECTION_ID,
			name: noProjectName,
			iconUrl: null,
			createdAt: Number.NEGATIVE_INFINITY,
		},
	]
		.map((section) => ({
			...section,
			workspaces: (byProject.get(section.projectId) ?? []).sort(
				byPinThenActivity,
			),
		}))
		.filter((section) => section.workspaces.length > 0)
		// Projects keep one order in every mode, as on desktop: newest first.
		.sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name));

	for (const section of sections) {
		const sectionCollapsed = isCollapsed(machineId, section.projectId);
		items.push({
			kind: "projectHeader",
			machineId,
			projectId: section.projectId,
			name: section.name,
			iconUrl: section.iconUrl,
			count: section.workspaces.length,
			collapsed: sectionCollapsed,
			attention: sectionCollapsed
				? strongestAttention(section.workspaces.map(rowAttention))
				: null,
			offline,
		});
		if (sectionCollapsed) continue;
		const projectId =
			section.projectId === NO_PROJECT_SECTION_ID ? null : section.projectId;
		// "No project" also holds rows of projects the host stopped
		// reporting; only true sessions can be grouped there.
		const canGroup = (workspace: HostWorkspaceItem) =>
			projectId !== null || workspace.projectId === null;
		const grouped = groupByTagFolder(
			projectId,
			section.workspaces.filter(canGroup),
			tagSettings,
		);
		const loose = new Set(grouped.ungrouped);
		grouped.ungrouped = section.workspaces.filter(
			(workspace) => loose.has(workspace) || !canGroup(workspace),
		);
		const groups: ProjectGroups = {
			machineId,
			projectId,
			folders: grouped.folders,
			folderTags: grouped.folderTags,
			workspaces: hostRows.filter(
				(workspace) => workspace.projectId === projectId,
			),
		};
		const children = orderProjectChildren(
			grouped,
			sort,
			activityTs,
			(workspace) => pinnedAt[workspace.id] !== undefined,
		);
		for (const child of children) {
			if (child.type === "workspace") {
				items.push({
					kind: "workspace",
					workspace: child.workspace,
					groups: canGroup(child.workspace) ? groups : undefined,
					folderTag: null,
					offline,
				});
				continue;
			}
			const { folder } = child;
			const folderCollapsed = isCollapsed(machineId, folder.key);
			items.push({
				kind: "folderHeader",
				machineId,
				folder,
				collapsed: folderCollapsed,
				attention: folderCollapsed
					? strongestAttention(folder.workspaces.map(rowAttention))
					: null,
				groups,
				offline,
			});
			if (folderCollapsed) continue;
			folder.workspaces.forEach((workspace, index) => {
				items.push({
					kind: "workspace",
					workspace,
					groups: canGroup(workspace) ? groups : undefined,
					folderTag: folder.tag,
					group: {
						color: folder.color,
						last: index === folder.workspaces.length - 1,
					},
					offline,
				});
			});
		}
	}

	return items;
}
