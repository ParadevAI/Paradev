import type { WorkspaceSort } from "../../stores/workspacesFilterStore";
import type { ProjectTagFolders, TagFolderGroup } from "../groupByTagFolder";

export type ProjectChild<W> =
	| { type: "workspace"; workspace: W }
	| { type: "folder"; folder: TagFolderGroup<W> };

// A missing time sorts below every known one, so the order stays total.
const rank = (time: number) =>
	Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;

/**
 * One project's rows in desktop's order for a sort mode. Folders and their
 * rows keep the order they arrive in, which the caller has already sorted.
 *
 * - `manual`: ungrouped rows, then folders, as on a desktop sidebar nobody
 *   has dragged.
 * - `active` and `created`: rows and folders mixed, newest first. A folder's activity is its newest row's. Its creation time
 *   is unknown here, so under `created` folders sink below the rows, as
 *   desktop's folders without a stored row do.
 */
export function orderProjectChildren<W extends { name: string }>(
	{ ungrouped, folders }: ProjectTagFolders<W>,
	sort: WorkspaceSort,
	time: (workspace: W) => number,
): ProjectChild<W>[] {
	const rows = ungrouped.map(
		(workspace): ProjectChild<W> => ({ type: "workspace", workspace }),
	);
	const groups = folders.map(
		(folder): ProjectChild<W> => ({ type: "folder", folder }),
	);
	if (sort === "manual") return [...rows, ...groups];

	const childTime = (child: ProjectChild<W>) => {
		if (child.type === "workspace") return rank(time(child.workspace));
		if (sort === "created") return Number.NEGATIVE_INFINITY;
		return Math.max(
			Number.NEGATIVE_INFINITY,
			...child.folder.workspaces.map((workspace) => rank(time(workspace))),
		);
	};
	const name = (child: ProjectChild<W>) =>
		child.type === "workspace" ? child.workspace.name : child.folder.name;

	return [...rows, ...groups].sort((a, b) => {
		const diff = childTime(b) - childTime(a);
		if (diff > 0 || diff < 0) return diff;
		return name(a).localeCompare(name(b));
	});
}
