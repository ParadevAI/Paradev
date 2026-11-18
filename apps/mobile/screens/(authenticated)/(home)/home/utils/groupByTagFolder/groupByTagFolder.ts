import {
	buildSidebarFolderKey,
	deriveTagFolders,
	getProjectFolderTagIndex,
	resolveWorkspaceFolder,
	type TagFolderSettingInput,
} from "@superset/shared/workspace-tag-folders";
import { tagFolderScope } from "@superset/shared/workspace-tags";

export interface TagFolderGroup<W> {
	key: string;
	tag: string;
	name: string;
	color: string | null;
	workspaces: W[];
}

export interface ProjectTagFolders<W> {
	ungrouped: W[];
	folders: TagFolderGroup<W>[];
}

/**
 * Splits one project's workspaces into desktop's sidebar folders with the
 * same membership rules desktop uses. Ungrouped workspaces come first and
 * folders after them, as on a desktop sidebar nobody has rearranged. Input
 * order is kept inside each group.
 */
export function groupByTagFolder<
	W extends { id: string; tags?: readonly string[] | null },
>(
	projectId: string | null,
	workspaces: readonly W[],
	tagSettings: readonly TagFolderSettingInput[],
): ProjectTagFolders<W> {
	const scope = tagFolderScope(projectId);
	const folders = deriveTagFolders(
		[],
		workspaces.map((workspace) => ({
			id: workspace.id,
			projectId,
			tags: workspace.tags,
		})),
		{ tagSettings, hiddenTagsByProject: new Map() },
	);
	const index = getProjectFolderTagIndex(folders, scope);
	const groups = new Map<string, TagFolderGroup<W>>();
	for (const folder of folders) {
		if (folder.projectId !== scope || folder.tag == null) continue;
		groups.set(folder.tag, {
			key: buildSidebarFolderKey(scope, folder.tag),
			tag: folder.tag,
			name: folder.name,
			color: folder.color,
			workspaces: [],
		});
	}

	const ungrouped: W[] = [];
	for (const workspace of workspaces) {
		const folder = resolveWorkspaceFolder(workspace.tags, index);
		const group = folder ? groups.get(folder.tag) : undefined;
		if (group) group.workspaces.push(workspace);
		else ungrouped.push(workspace);
	}

	const orderOf = (tag: string) => index.get(tag)?.tabOrder ?? 0;
	return {
		ungrouped,
		folders: [...groups.entries()]
			.filter(([, group]) => group.workspaces.length > 0)
			.sort(([a], [b]) => orderOf(a) - orderOf(b) || a.localeCompare(b))
			.map(([, group]) => group),
	};
}
