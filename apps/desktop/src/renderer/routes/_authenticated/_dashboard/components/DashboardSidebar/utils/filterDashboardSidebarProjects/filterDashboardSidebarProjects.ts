import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
} from "../../types";
import { groupProjectChildrenByTopLevel } from "../projectChildren";

function matches(text: string, normalizedQuery: string): boolean {
	return text.toLowerCase().includes(normalizedQuery);
}

// Reuse the input objects whenever nothing about them changes — the sidebar's
// memoized rows rely on referential stability, and the filter reruns on every
// keystroke.
function expandProject(
	project: DashboardSidebarProject,
): DashboardSidebarProject {
	return project.isCollapsed ? { ...project, isCollapsed: false } : project;
}

type SectionChild = Extract<DashboardSidebarProjectChild, { type: "section" }>;

function expandSection(
	child: SectionChild,
	workspaces = child.section.workspaces,
): DashboardSidebarProjectChild {
	const { section } = child;
	if (
		!section.isCollapsed &&
		!section.isAncestorCollapsed &&
		workspaces === section.workspaces
	) {
		return child;
	}
	return {
		type: "section",
		section: {
			...section,
			isCollapsed: false,
			isAncestorCollapsed: false,
			workspaces,
		},
	};
}

/**
 * One top-level group and its sub-groups. A group stays when its name
 * matches (whole, with everything below it), when it holds a matching row,
 * or when a sub-group below it stays — so a match is never cut off from the
 * groups that lead to it.
 */
function filterSectionUnit(
	unit: SectionChild[],
	normalizedQuery: string,
): DashboardSidebarProjectChild[] {
	const keptWorkspaces = new Map<
		string,
		SectionChild["section"]["workspaces"]
	>();
	const isNameMatchedById = new Map<string, boolean>();
	for (const child of unit) {
		const { section } = child;
		const isNameMatched =
			matches(section.name, normalizedQuery) ||
			(section.parentId !== null &&
				(isNameMatchedById.get(section.parentId) ?? false));
		isNameMatchedById.set(section.id, isNameMatched);
		const workspaces = isNameMatched
			? section.workspaces
			: section.workspaces.filter((workspace) =>
					matches(workspace.name, normalizedQuery),
				);
		if (isNameMatched || workspaces.length > 0) {
			keptWorkspaces.set(section.id, workspaces);
		}
	}
	// Children follow their parent, so a reverse walk sees every kept
	// sub-group before deciding on its parent.
	for (const child of [...unit].reverse()) {
		const { section } = child;
		if (!keptWorkspaces.has(section.id) || section.parentId === null) continue;
		if (!keptWorkspaces.has(section.parentId)) {
			keptWorkspaces.set(section.parentId, []);
		}
	}
	return unit.flatMap((child) => {
		const workspaces = keptWorkspaces.get(child.section.id);
		if (!workspaces) return [];
		return [
			expandSection(
				child,
				workspaces.length === child.section.workspaces.length
					? child.section.workspaces
					: workspaces,
			),
		];
	});
}

function filterChildren(
	children: DashboardSidebarProjectChild[],
	normalizedQuery: string,
): DashboardSidebarProjectChild[] {
	return groupProjectChildrenByTopLevel(children).flatMap(
		(unit): DashboardSidebarProjectChild[] => {
			const [head] = unit;
			if (!head) return [];
			if (head.type === "workspace") {
				return matches(head.workspace.name, normalizedQuery) ? [head] : [];
			}
			return filterSectionUnit(
				unit.filter((child): child is SectionChild => child.type === "section"),
				normalizedQuery,
			);
		},
	);
}

/**
 * Case-insensitive substring filter over projects. A project survives when its
 * name matches (kept whole) or when any of its workspaces/folders match
 * (pruned to the matches; a matching folder keeps all its members). Surviving
 * projects and matched folders come back expanded so the matches are actually
 * visible; the persisted collapse state is never written. Branch names are
 * deliberately not searched: v2 names are branch-derived, and matching hidden
 * text would surface rows whose visible label doesn't contain the query.
 */
export function filterDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
	query: string,
): DashboardSidebarProject[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (normalizedQuery === "") return projects;

	return projects.flatMap((project): DashboardSidebarProject[] => {
		if (matches(project.name, normalizedQuery)) {
			return [expandProject(project)];
		}
		const children = filterChildren(project.children, normalizedQuery);
		if (children.length === 0) return [];
		const childrenUnchanged =
			children.length === project.children.length &&
			children.every((child, index) => child === project.children[index]);
		if (childrenUnchanged) return [expandProject(project)];
		return [{ ...project, isCollapsed: false, children }];
	});
}
