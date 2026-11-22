import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import type { WorkspaceSort } from "../../stores/workspacesFilterStore/workspacesFilterStore";
import type { HomeListItem } from "../../types";
import { CLOUD_PLACE_ID } from "../buildAllHostsList";
import { NO_PROJECT_SECTION_ID } from "../buildHostSection";
import { groupByTagFolder } from "../groupByTagFolder";
import { orderProjectChildren } from "../orderProjectChildren";
import { strongestAttention } from "../strongestAttention";

export interface CloudRepo {
	id: string;
	fullName: string;
}

export type CloudRepos =
	| { status: "pending" }
	| { status: "error" }
	| { status: "success"; byWorkspace: ReadonlyMap<string, CloudRepo> };

export interface CloudSectionOptions {
	sort: WorkspaceSort;
	/** Archived rows rank by when they were archived. */
	archived: boolean;
	rowAttention: (row: CloudWorkspaceRow) => TerminalAttention | null;
	isCollapsed: (placeId: string, key: string) => boolean;
	noProjectName: string;
	/** Rows listed in the Pinned section instead of under their repository. */
	lifted?: ReadonlySet<string>;
}

/** `owner/name` → `name`. */
export function repoShortName(fullName: string): string {
	return fullName.slice(fullName.indexOf("/") + 1);
}

/** The time a cloud row ranks by, as a host row does under the same sort. */
export function cloudRowSortTime(
	row: CloudWorkspaceRow,
	sort: WorkspaceSort,
	archived: boolean,
): number {
	if (archived) return (row.deletedAt ?? row.createdAt).getTime();
	if (sort !== "active") return row.createdAt.getTime();
	return (row.agentStatusAt ?? row.createdAt).getTime();
}

/**
 * Cloud's rows as a host lists its own: a section per primary repository,
 * groups from the rows' tags, then rows. Null while the repositories have
 * not answered, so rows are never filed under no repository by mistake; if
 * they failed, one flat list.
 */
export function buildCloudSection(
	rows: readonly CloudWorkspaceRow[],
	repos: CloudRepos,
	{
		sort,
		archived,
		rowAttention,
		isCollapsed,
		noProjectName,
		lifted,
	}: CloudSectionOptions,
): HomeListItem[] | null {
	const time = (row: CloudWorkspaceRow) =>
		cloudRowSortTime(row, sort, archived);
	const newestFirst = (a: CloudWorkspaceRow, b: CloudWorkspaceRow) =>
		time(b) - time(a) || a.name.localeCompare(b.name);
	const sorted = rows.filter((row) => !lifted?.has(row.id)).sort(newestFirst);

	if (sorted.length === 0) return [];
	if (repos.status === "pending") return null;
	if (repos.status === "error") {
		return sorted.map((row) => ({ kind: "cloudRow", row }));
	}

	const sections = new Map<
		string,
		{ name: string; rows: CloudWorkspaceRow[] }
	>();
	for (const row of sorted) {
		const repo = repos.byWorkspace.get(row.id);
		const id = repo?.id ?? NO_PROJECT_SECTION_ID;
		const section = sections.get(id);
		if (section) section.rows.push(row);
		else {
			sections.set(id, {
				name: repo ? repoShortName(repo.fullName) : noProjectName,
				rows: [row],
			});
		}
	}

	const ordered = [...sections.entries()].sort(([aId, a], [bId, b]) => {
		if (aId === NO_PROJECT_SECTION_ID) return 1;
		if (bId === NO_PROJECT_SECTION_ID) return -1;
		return a.name.localeCompare(b.name);
	});

	const items: HomeListItem[] = [];
	for (const [id, section] of ordered) {
		const collapsed = isCollapsed(CLOUD_PLACE_ID, id);
		items.push({
			kind: "projectHeader",
			machineId: CLOUD_PLACE_ID,
			projectId: id,
			name: section.name,
			iconUrl: null,
			count: section.rows.length,
			collapsed,
			attention: collapsed
				? strongestAttention(section.rows.map(rowAttention))
				: null,
			offline: false,
			cloud: true,
		});
		if (collapsed) continue;
		const grouped = groupByTagFolder(
			id === NO_PROJECT_SECTION_ID ? null : id,
			section.rows,
			[],
		);
		for (const child of orderProjectChildren(
			grouped,
			sort,
			time,
			() => false,
		)) {
			if (child.type === "workspace") {
				items.push({ kind: "cloudRow", row: child.workspace });
				continue;
			}
			const { folder } = child;
			const folderCollapsed = isCollapsed(CLOUD_PLACE_ID, folder.key);
			items.push({
				kind: "folderHeader",
				machineId: CLOUD_PLACE_ID,
				folder,
				groups: null,
				collapsed: folderCollapsed,
				attention: folderCollapsed
					? strongestAttention(folder.workspaces.map(rowAttention))
					: null,
				offline: false,
			});
			if (folderCollapsed) continue;
			for (const row of folder.workspaces) {
				items.push({ kind: "cloudRow", row, grouped: true });
			}
		}
	}
	return items;
}
