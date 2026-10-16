import type {
	DashboardSidebarPinnedWorkspace,
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarWorkspace,
} from "../../types";
import { sameItems } from "../../utils/sameItems";

/**
 * A placed cloud row comes out of the project builder decorated as a device
 * row (host type from its host id, PR from the host poll). Swap in the row
 * the cloud list built, keeping only what placement decided: project, pin
 * state and the in-flight transaction.
 */
function withCloudRow(
	built: DashboardSidebarWorkspace,
	cloudRowById: ReadonlyMap<string, DashboardSidebarWorkspace>,
): DashboardSidebarWorkspace {
	const cloud = cloudRowById.get(built.id);
	if (!cloud) return built;
	return {
		...cloud,
		projectId: built.projectId,
		isPinned: built.isPinned,
		pendingTransaction: built.pendingTransaction,
	};
}

function withCloudChild(
	child: DashboardSidebarProjectChild,
	cloudRowById: ReadonlyMap<string, DashboardSidebarWorkspace>,
): DashboardSidebarProjectChild {
	if (child.type === "workspace") {
		const workspace = withCloudRow(child.workspace, cloudRowById);
		return workspace === child.workspace
			? child
			: { type: "workspace", workspace };
	}
	const workspaces = child.section.workspaces.map((workspace) =>
		withCloudRow(workspace, cloudRowById),
	);
	return sameItems(workspaces, child.section.workspaces)
		? child
		: { type: "section", section: { ...child.section, workspaces } };
}

/**
 * Re-applies cloud identity to the rows the builder placed, and marks the
 * stand-in projects (a repo with no checkout on any host). Everything that
 * holds no cloud row is returned as the same object.
 */
export function applyCloudSidebarRows(
	projects: DashboardSidebarProject[],
	cloudRowById: ReadonlyMap<string, DashboardSidebarWorkspace>,
	standInProjectIds: ReadonlySet<string>,
): DashboardSidebarProject[] {
	return projects.map((project) => {
		const children = project.children.map((child) =>
			withCloudChild(child, cloudRowById),
		);
		const isStandIn = standInProjectIds.has(project.id);
		if (sameItems(children, project.children) && !isStandIn) return project;
		return {
			...project,
			children,
			...(isStandIn ? { kind: "cloud-repo" as const } : {}),
		};
	});
}

export function applyCloudSidebarPinnedRows(
	pinned: DashboardSidebarPinnedWorkspace[],
	cloudRowById: ReadonlyMap<string, DashboardSidebarWorkspace>,
): DashboardSidebarPinnedWorkspace[] {
	return pinned.map((workspace) => {
		const cloud = cloudRowById.get(workspace.id);
		if (!cloud) return workspace;
		return {
			...withCloudRow(workspace, cloudRowById),
			projectName: workspace.projectName,
			projectIconUrl: workspace.projectIconUrl,
		};
	});
}
