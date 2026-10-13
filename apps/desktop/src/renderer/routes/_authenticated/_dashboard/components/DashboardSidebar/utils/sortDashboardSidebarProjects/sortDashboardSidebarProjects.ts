import {
	getWorkspaceActivityTime,
	toTime,
} from "@superset/shared/workspace-activity";
import type { SidebarProjectSortMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarWorkspace,
} from "../../types";
import { groupProjectChildrenByTopLevel } from "../projectChildren";

// An item with no usable timestamp sinks below everything dated. Mapping
// NaN to -Infinity keeps the comparator a consistent total order instead of
// interleaving unknowns by name.
function rankTime(time: number): number {
	return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function newest(times: number[]): number {
	const known = times.filter((time) => !Number.isNaN(time));
	return known.length > 0 ? Math.max(...known) : Number.NaN;
}

function makeStableComparator<Item>(
	byTimestamp: (item: Item) => number,
	byName: (item: Item) => string,
	byId: (item: Item) => string,
): (left: Item, right: Item) => number {
	return (left, right) => {
		const diff = rankTime(byTimestamp(right)) - rankTime(byTimestamp(left));
		if (!Number.isNaN(diff) && diff !== 0) return diff;
		const names = byName(left).localeCompare(byName(right));
		if (names !== 0) return names;
		return byId(left).localeCompare(byId(right));
	};
}

function getWorkspaceTimestamp(
	workspace: DashboardSidebarWorkspace,
	mode: SidebarProjectSortMode,
): number {
	return mode === "created"
		? toTime(workspace.createdAt)
		: getWorkspaceActivityTime(workspace);
}

// Mirrors the project-level rules one level down: "created" uses the
// section's own createdAt, "active" uses the most recently active workspace
// anywhere in it, sub-groups included (falling back to createdAt when empty).
function getUnitTimestamp(
	unit: DashboardSidebarProjectChild[],
	mode: SidebarProjectSortMode,
): number {
	const [head] = unit;
	if (!head) return Number.NaN;
	if (head.type === "workspace") {
		return getWorkspaceTimestamp(head.workspace, mode);
	}
	if (mode === "created") return toTime(head.section.createdAt);
	const activity = newest(
		unit.flatMap((child) =>
			child.type === "section"
				? child.section.workspaces.map(getWorkspaceActivityTime)
				: [],
		),
	);
	return Number.isNaN(activity) ? toTime(head.section.createdAt) : activity;
}

function getUnitHead(
	unit: DashboardSidebarProjectChild[],
): DashboardSidebarProjectChild {
	const [head] = unit;
	if (!head) throw new Error("empty sidebar unit");
	return head;
}

function haveSameItems<Item>(left: Item[], right: Item[]): boolean {
	return (
		left.length === right.length &&
		left.every((item, index) => item === right[index])
	);
}

/**
 * Orders a project's children for a non-manual sort mode: workspaces inside
 * each section sort by the mode, top-level sections (carrying their
 * sub-groups, which keep their manual order) reorder among the loose
 * workspaces by their own timestamp. Returns the input array (and the input section objects) when nothing
 * moves, so memoized rows keep their identity.
 */
export function sortDashboardSidebarProjectChildren(
	children: DashboardSidebarProjectChild[],
	mode: SidebarProjectSortMode,
): DashboardSidebarProjectChild[] {
	if (mode === "manual") return children;

	const compareWorkspaces = makeStableComparator<DashboardSidebarWorkspace>(
		(workspace) => getWorkspaceTimestamp(workspace, mode),
		(workspace) => workspace.name,
		(workspace) => workspace.id,
	);
	const compareUnits = makeStableComparator<DashboardSidebarProjectChild[]>(
		(unit) => getUnitTimestamp(unit, mode),
		(unit) => {
			const head = getUnitHead(unit);
			return head.type === "workspace"
				? head.workspace.name
				: head.section.name;
		},
		(unit) => {
			const head = getUnitHead(unit);
			return head.type === "workspace" ? head.workspace.id : head.section.id;
		},
	);

	const sortedInside = children.map((child) => {
		if (child.type !== "section") return child;
		const workspaces = [...child.section.workspaces].sort(compareWorkspaces);
		return haveSameItems(workspaces, child.section.workspaces)
			? child
			: { ...child, section: { ...child.section, workspaces } };
	});

	const sorted = groupProjectChildrenByTopLevel(sortedInside)
		.sort(compareUnits)
		.flat();
	return haveSameItems(sorted, children) ? children : sorted;
}

/**
 * Sorts each project's children for a sort mode. The project list itself is
 * always the manual (drag) order: projects are the stable landmarks people
 * navigate by, and reshuffling them under the user because an agent touched
 * a workspace loses the map. `manual` returns the input untouched; the other
 * modes never mutate it, and a project whose children are already in order
 * keeps its identity.
 */
export function sortDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
	mode: SidebarProjectSortMode,
): DashboardSidebarProject[] {
	if (mode === "manual") return projects;

	return projects.map((project) => {
		const children = sortDashboardSidebarProjectChildren(
			project.children,
			mode,
		);
		return children === project.children ? project : { ...project, children };
	});
}
