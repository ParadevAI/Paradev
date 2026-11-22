import type { TagFolderSettingInput } from "@superset/shared/workspace-tag-folders";
import type { HostProjectItem } from "@/hooks/useHostProjects";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import type { WorkspaceSort } from "../../stores/workspacesFilterStore/workspacesFilterStore";
import type { HomeListItem, ProjectGroups } from "../../types";
import { groupBarColor } from "../groupBarColor";
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
	activityTs: (workspace: HostWorkspaceItem) => number;
	rowAttention: (workspace: HostWorkspaceItem) => TerminalAttention | null;
	isCollapsed: (machineId: string, key: string) => boolean;
	noProjectName: string;
	lifted: ReadonlySet<string>;
}

export function buildHostSection(
	{ machineId, workspaces, projects, tagSettings, offline }: HostSectionInput,
	{
		sort,
		activityTs,
		rowAttention,
		isCollapsed,
		noProjectName,
		lifted,
	}: HostSectionOptions,
): HomeListItem[] {
	const items: HomeListItem[] = [];

	const newestFirst = (a: HostWorkspaceItem, b: HostWorkspaceItem) => {
		const diff = activityTs(b) - activityTs(a);
		return Number.isNaN(diff) ? a.name.localeCompare(b.name) : diff;
	};

	const hostRows = workspaces.filter(
		(workspace) => workspace.hostId === machineId,
	);
	// A record whose worktree folder is gone from the host's disk is a stale
	// shell nothing can run in — not worth a list slot.
	const pool = hostRows.filter(
		(workspace) =>
			workspace.worktreeExists !== false && !lifted.has(workspace.id),
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
			workspaces: (byProject.get(section.projectId) ?? []).sort(newestFirst),
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
		const children = orderProjectChildren(grouped, sort, activityTs);
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
			for (const workspace of folder.workspaces) {
				items.push({
					kind: "workspace",
					workspace,
					groups: canGroup(workspace) ? groups : undefined,
					folderTag: folder.tag,
					group: { color: folder.color, bar: null },
					offline,
				});
			}
		}
	}

	return withGroupBars(items);
}

/** The colour an item's bar would draw: its group's, if the group has one. */
function barColorOf(item: HomeListItem | undefined): string | null {
	if (item?.kind === "folderHeader") return groupBarColor(item.folder.color);
	if (item?.kind === "workspace" && item.group) {
		return groupBarColor(item.group.color);
	}
	return null;
}

/**
 * Gives each group header and grouped row its piece of the group's colour
 * bar. A piece joins the one above or below when that item draws a bar too,
 * so neighbouring groups' bars meet with no gap.
 */
function withGroupBars(items: HomeListItem[]): HomeListItem[] {
	return items.map((item, index) => {
		const color = barColorOf(item);
		const bar = color
			? {
					color,
					joinTop: barColorOf(items[index - 1]) !== null,
					joinBottom: barColorOf(items[index + 1]) !== null,
				}
			: null;
		if (item.kind === "folderHeader") return { ...item, bar };
		if (item.kind === "workspace" && item.group) {
			return { ...item, group: { ...item.group, bar } };
		}
		return item;
	});
}
