import type { SidebarProjectHostFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarWorkspace,
} from "../../types";
import { sameItems } from "../sameItems";

/** Whether a row survives `filter`: "local" is any device, "cloud" is a sandbox. */
export function matchesHostFilter(
	workspace: Pick<DashboardSidebarWorkspace, "hostType">,
	filter: SidebarProjectHostFilter,
): boolean {
	if (filter === "all") return true;
	return (workspace.hostType === "cloud") === (filter === "cloud");
}

function filterChildren(
	children: DashboardSidebarProjectChild[],
	filter: Exclude<SidebarProjectHostFilter, "all">,
): DashboardSidebarProjectChild[] {
	return children.flatMap((child): DashboardSidebarProjectChild[] => {
		if (child.type === "workspace") {
			return matchesHostFilter(child.workspace, filter) ? [child] : [];
		}
		const workspaces = child.section.workspaces.filter((workspace) =>
			matchesHostFilter(workspace, filter),
		);
		if (workspaces.length === 0) return [];
		if (sameItems(workspaces, child.section.workspaces)) return [child];
		return [{ type: "section", section: { ...child.section, workspaces } }];
	});
}

/**
 * Keeps only the rows that run where `filter` says: "local" is any device
 * (this one or a paired one), "cloud" is a sandbox. A project left empty by
 * the filter is dropped; one that was empty already stays under "local",
 * so a new project and its "+" don't vanish. Collapse state is untouched, and every project, folder
 * and row that survives whole is returned as the same object so the
 * sidebar's memoized rows don't re-render.
 */
export function filterDashboardSidebarProjectsByHost(
	projects: DashboardSidebarProject[],
	filter: SidebarProjectHostFilter,
): DashboardSidebarProject[] {
	if (filter === "all") return projects;

	return projects.flatMap((project): DashboardSidebarProject[] => {
		if (project.children.length === 0)
			return filter === "local" ? [project] : [];
		const children = filterChildren(project.children, filter);
		if (children.length === 0) return [];
		if (sameItems(children, project.children)) return [project];
		return [{ ...project, children }];
	});
}
