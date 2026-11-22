import type {
	DashboardSidebarProject,
	DashboardSidebarWorkspace,
} from "../../types";

type StableWorkspaces = Map<
	string,
	{ fingerprint: string; workspace: DashboardSidebarWorkspace }
>;

export interface StableDashboardSidebarProjects {
	projects: DashboardSidebarProject[];
	byId: Map<
		string,
		{
			fingerprint: string;
			project: DashboardSidebarProject;
			workspaces: StableWorkspaces;
		}
	>;
}

function haveSameProjects(
	left: DashboardSidebarProject[],
	right: DashboardSidebarProject[],
): boolean {
	return (
		left.length === right.length &&
		left.every((project, index) => project === right[index])
	);
}

/**
 * A changed project still keeps its unchanged workspace objects: rows memoize
 * on them, and one tag write otherwise re-rendered every row of the project.
 */
function reuseUnchangedWorkspaces(
	project: DashboardSidebarProject,
	previous: StableWorkspaces | undefined,
	next: StableWorkspaces,
): DashboardSidebarProject {
	const stable = (workspace: DashboardSidebarWorkspace) => {
		const fingerprint = JSON.stringify(workspace);
		const previousWorkspace = previous?.get(workspace.id);
		const reused =
			previousWorkspace?.fingerprint === fingerprint
				? previousWorkspace.workspace
				: workspace;
		next.set(workspace.id, { fingerprint, workspace: reused });
		return reused;
	};
	return {
		...project,
		children: project.children.map((child) =>
			child.type === "workspace"
				? { ...child, workspace: stable(child.workspace) }
				: {
						...child,
						section: {
							...child.section,
							workspaces: child.section.workspaces.map(stable),
						},
					},
		),
	};
}

/** Returns the previous objects for every project and workspace that did not change. */
export function stabilizeDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
	previous: StableDashboardSidebarProjects | null,
): StableDashboardSidebarProjects {
	const byId: StableDashboardSidebarProjects["byId"] = new Map();
	const nextProjects = projects.map((project) => {
		const fingerprint = JSON.stringify(project);
		const previousProject = previous?.byId.get(project.id);
		if (previousProject?.fingerprint === fingerprint) {
			byId.set(project.id, previousProject);
			return previousProject.project;
		}
		const workspaces: StableWorkspaces = new Map();
		const stableProject = reuseUnchangedWorkspaces(
			project,
			previousProject?.workspaces,
			workspaces,
		);
		byId.set(project.id, { fingerprint, project: stableProject, workspaces });
		return stableProject;
	});

	if (previous && haveSameProjects(previous.projects, nextProjects)) {
		return { projects: previous.projects, byId };
	}
	return { projects: nextProjects, byId };
}
