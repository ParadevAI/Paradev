import type {
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";

export function getProjectChildrenSections(
	children: DashboardSidebarProjectChild[],
): Pick<DashboardSidebarSection, "id" | "name">[] {
	return children.flatMap((child) =>
		child.type === "section"
			? [{ id: child.section.id, name: child.section.name }]
			: [],
	);
}

/**
 * Per group: the collapsed groups that hide its rows — itself and any
 * collapsed ancestor, outermost first. Expanding all of them reveals a row.
 */
export function getCollapsedSectionLineage(
	children: DashboardSidebarProjectChild[],
): Map<string, string[]> {
	const lineageById = new Map<string, string[]>();
	for (const child of children) {
		if (child.type !== "section") continue;
		const { section } = child;
		const inherited =
			section.parentId === null
				? []
				: (lineageById.get(section.parentId) ?? []);
		lineageById.set(
			section.id,
			section.isCollapsed ? [...inherited, section.id] : inherited,
		);
	}
	return lineageById;
}

/**
 * A lane's children as top-level units: an ungrouped row alone, or a
 * top-level group followed by all its sub-groups. Reordering units, never
 * the children inside them, keeps every sub-group under its parent.
 */
export function groupProjectChildrenByTopLevel(
	children: DashboardSidebarProjectChild[],
): DashboardSidebarProjectChild[][] {
	const units: DashboardSidebarProjectChild[][] = [];
	for (const child of children) {
		const current = units.at(-1);
		if (child.type === "section" && child.section.depth > 0 && current) {
			current.push(child);
		} else {
			units.push([child]);
		}
	}
	return units;
}

export function getProjectChildrenWorkspaces(
	children: DashboardSidebarProjectChild[],
): DashboardSidebarWorkspace[] {
	return children.flatMap((child) =>
		child.type === "workspace" ? [child.workspace] : child.section.workspaces,
	);
}
