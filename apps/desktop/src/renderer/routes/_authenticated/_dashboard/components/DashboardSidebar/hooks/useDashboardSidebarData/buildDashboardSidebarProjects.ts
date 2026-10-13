import { SESSIONS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import {
	getProjectFolderTagIndex,
	orderFolderTree,
	resolveWorkspaceSectionId,
	type TagFolderRef,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import type { WorkspaceTransactionSnapshot } from "renderer/stores/workspace-creates";
import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";
import type {
	DashboardSidebarPinnedWorkspace,
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarSessions,
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspaceType,
} from "../../types";

type SidebarPullRequest = DashboardSidebarWorkspace["pullRequest"];

export interface SidebarProjectInput {
	id: string;
	name: string;
	githubOwner: string | null;
	githubRepoName: string | null;
	iconUrl: string | null;
	/** Accent color as a `#rrggbb` hex, or null for the default. */
	color: string | null;
	createdAt: Date;
	updatedAt: Date;
	isCollapsed: boolean;
}

export interface SidebarSectionInput {
	id: string;
	projectId: string;
	name: string;
	createdAt: Date;
	isCollapsed: boolean;
	tabOrder: number;
	color: string | null;
	/**
	 * Non-null = tag-backed folder: membership comes from workspace tags, and
	 * `sectionId` pointers at it are ignored. Null/absent = legacy folder that
	 * owns members via `sectionId`. Callers pass the deriveTagFolders union so
	 * tag-only folders exist here too.
	 */
	tag?: string | null;
	/** Enclosing folder's id for a sub-folder; null/absent at the top. */
	parentId?: string | null;
}

export interface SidebarWorkspaceInput {
	id: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	hostId: string;
	type: DashboardSidebarWorkspaceType;
	hostIsOnline: boolean;
	name: string;
	branch: string;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
	/** Host-stamped agent activity; null from a host that predates it. */
	lastActivityAt: number | null;
	tabOrder: number;
	sectionId: string | null;
	/** Host tag set; absent when served by an older host. */
	tags?: readonly string[] | null;
	pinnedAt: number | null;
	pendingTransaction: WorkspaceTransactionSnapshot | null;
}

interface SectionForest {
	sectionMap: Map<string, DashboardSidebarSection>;
	roots: DashboardSidebarSection[];
	/** Each top-level group's sub-groups, in pre-order. */
	descendantsByRootId: Map<string, DashboardSidebarSection[]>;
}

/**
 * One lane's groups as a forest. A sub-group with no color of its own shows
 * its parent's, and collapsing a group hides every group below it.
 */
function buildSectionForest(sections: SidebarSectionInput[]): SectionForest {
	const sectionMap = new Map<string, DashboardSidebarSection>();
	const roots: DashboardSidebarSection[] = [];
	const descendantsByRootId = new Map<string, DashboardSidebarSection[]>();
	let currentRootId: string | null = null;
	const ordered = orderFolderTree(
		sections,
		(left, right) =>
			left.tabOrder - right.tabOrder || left.id.localeCompare(right.id),
	);
	for (const { folder, depth } of ordered) {
		const parent =
			depth > 0 && folder.parentId != null
				? sectionMap.get(folder.parentId)
				: undefined;
		const section: DashboardSidebarSection = {
			...folder,
			color: folder.color ?? parent?.color ?? null,
			parentId: parent?.id ?? null,
			depth,
			isAncestorCollapsed: parent
				? parent.isCollapsed || parent.isAncestorCollapsed
				: false,
			workspaces: [],
		};
		sectionMap.set(section.id, section);
		if (depth === 0 || currentRootId === null) {
			roots.push(section);
			descendantsByRootId.set(section.id, []);
			currentRootId = section.id;
		} else {
			descendantsByRootId.get(currentRootId)?.push(section);
		}
	}
	return { sectionMap, roots, descendantsByRootId };
}

/** Puts each top-level group's sub-groups right after it. */
function withSubSections(
	children: DashboardSidebarProjectChild[],
	descendantsByRootId: ReadonlyMap<string, DashboardSidebarSection[]>,
): DashboardSidebarProjectChild[] {
	return children.flatMap((child): DashboardSidebarProjectChild[] =>
		child.type === "section"
			? [
					child,
					...(descendantsByRootId.get(child.section.id) ?? []).map(
						(section) => ({ type: "section" as const, section }),
					),
				]
			: [child],
	);
}

/**
 * Splits the visible rows into pinned (sorted by pin time ascending, so new
 * pins append at the bottom of the Pinned section) and everything else. The
 * caller feeds `unpinned` to {@link buildDashboardSidebarProjects} and
 * `pinned` to {@link buildDashboardSidebarPinnedWorkspaces} — a pinned
 * workspace renders only in the Pinned section, never in its project group.
 */
export function partitionSidebarWorkspacesByPinned<
	Workspace extends { pinnedAt: number | null },
>(workspaces: Workspace[]): { pinned: Workspace[]; unpinned: Workspace[] } {
	const pinned: Workspace[] = [];
	const unpinned: Workspace[] = [];
	for (const workspace of workspaces) {
		(workspace.pinnedAt != null ? pinned : unpinned).push(workspace);
	}
	pinned.sort((left, right) => (left.pinnedAt ?? 0) - (right.pinnedAt ?? 0));
	return { pinned, unpinned };
}

function decorateSidebarWorkspace(
	workspace: SidebarWorkspaceInput,
	project: Pick<SidebarProjectInput, "githubOwner" | "githubRepoName">,
	machineId: string,
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>,
): DashboardSidebarWorkspace {
	const hostType: DashboardSidebarWorkspace["hostType"] =
		workspace.hostId === machineId ? "local-device" : "remote-device";

	return {
		id: workspace.id,
		projectId: workspace.projectId,
		hostId: workspace.hostId,
		hostType,
		type: workspace.type,
		hostIsOnline: hostType === "remote-device" ? workspace.hostIsOnline : null,
		accentColor: null,
		name: getV2WorkspaceDisplayName(workspace),
		branch: workspace.branch,
		pullRequest: pullRequestsByWorkspaceId.get(workspace.id) ?? null,
		repoUrl:
			project.githubOwner && project.githubRepoName
				? `https://github.com/${project.githubOwner}/${project.githubRepoName}`
				: null,
		branchExistsOnRemote:
			project.githubOwner !== null && project.githubRepoName !== null,
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: workspace.createdAt,
		updatedAt: workspace.updatedAt,
		lastActivityAt: workspace.lastActivityAt,
		taskId: workspace.taskId,
		isPinned: workspace.pinnedAt != null,
		pendingTransaction: workspace.pendingTransaction,
	};
}

/**
 * Decorates pinned rows for the sidebar's top-level Pinned section. Rows keep
 * their partition order (pin time ascending). A pinned workspace whose project
 * is no longer in the sidebar is dropped, matching how
 * {@link buildDashboardSidebarProjects} treats project-less rows.
 */
export function buildDashboardSidebarPinnedWorkspaces({
	pinnedSidebarWorkspaces,
	sidebarProjects,
	machineId,
	pullRequestsByWorkspaceId,
}: {
	pinnedSidebarWorkspaces: SidebarWorkspaceInput[];
	sidebarProjects: SidebarProjectInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
}): DashboardSidebarPinnedWorkspace[] {
	const projectsById = new Map(
		sidebarProjects.map((project) => [project.id, project]),
	);
	return pinnedSidebarWorkspaces.flatMap(
		(workspace): DashboardSidebarPinnedWorkspace[] => {
			// Pinned sessions render with no project identity.
			if (workspace.projectId === null) {
				return [
					{
						...decorateSidebarWorkspace(
							workspace,
							{ githubOwner: null, githubRepoName: null },
							machineId,
							pullRequestsByWorkspaceId,
						),
						projectName: null,
						projectIconUrl: null,
					},
				];
			}
			const project = projectsById.get(workspace.projectId);
			if (!project) return [];
			return [
				{
					...decorateSidebarWorkspace(
						workspace,
						project,
						machineId,
						pullRequestsByWorkspaceId,
					),
					projectName: project.name,
					projectIconUrl: project.iconUrl,
				},
			];
		},
	);
}

/**
 * Builds the project-less Sessions lane with the same shape as a project's
 * children: ungrouped sessions and tag folders interleaved by tabOrder, each
 * folder carrying its members. Folder rows are the Sessions-scoped entries of
 * `sidebarSections`; membership resolves through the shared tag-folder index,
 * so a session files into the folder of its winning tag exactly like a
 * project workspace does.
 */
export function buildDashboardSidebarSessions({
	sessionSidebarWorkspaces,
	sidebarSections,
	machineId,
	pullRequestsByWorkspaceId,
}: {
	sessionSidebarWorkspaces: SidebarWorkspaceInput[];
	sidebarSections: SidebarSectionInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
}): DashboardSidebarSessions {
	const { sectionMap, roots, descendantsByRootId } = buildSectionForest(
		sidebarSections.filter(
			(section) => section.projectId === SESSIONS_TAG_SCOPE,
		),
	);
	const childEntries: Array<{
		tabOrder: number;
		child: DashboardSidebarProjectChild;
	}> = roots.map((section) => ({
		tabOrder: section.tabOrder,
		child: { type: "section", section },
	}));
	const orphaned: Array<{
		tabOrder: number;
		workspace: DashboardSidebarWorkspace;
	}> = [];

	const folderIndex = getProjectFolderTagIndex(
		sidebarSections.map((section) => ({
			sectionId: section.id,
			projectId: section.projectId,
			tabOrder: section.tabOrder,
			tag: section.tag,
		})),
		SESSIONS_TAG_SCOPE,
	);

	const sorted = sessionSidebarWorkspaces
		.slice()
		.sort(
			(left, right) =>
				left.tabOrder - right.tabOrder || left.id.localeCompare(right.id),
		);
	for (const workspace of sorted) {
		const decorated = decorateSidebarWorkspace(
			workspace,
			{ githubOwner: null, githubRepoName: null },
			machineId,
			pullRequestsByWorkspaceId,
		);
		const effectiveSectionId = resolveWorkspaceSectionId({
			tags: workspace.tags,
			localSectionId: workspace.sectionId,
			index: folderIndex,
		});
		if (effectiveSectionId) {
			const section = sectionMap.get(effectiveSectionId);
			if (section) {
				section.workspaces.push({ ...decorated, accentColor: section.color });
				continue;
			}
			orphaned.push({ tabOrder: workspace.tabOrder, workspace: decorated });
			continue;
		}
		childEntries.push({
			tabOrder: workspace.tabOrder,
			child: { type: "workspace", workspace: decorated },
		});
	}

	const children: DashboardSidebarProjectChild[] = childEntries
		.sort((left, right) => left.tabOrder - right.tabOrder)
		.map(({ child }) => child);
	if (orphaned.length > 0) {
		// A member whose folder is hidden/missing keeps a top-level slot
		// ahead of the first folder, matching the project builder.
		const firstSectionIndex = children.findIndex(
			(child) => child.type === "section",
		);
		children.splice(
			firstSectionIndex === -1 ? children.length : firstSectionIndex,
			0,
			...orphaned
				.sort((left, right) => left.tabOrder - right.tabOrder)
				.map(({ workspace }) => ({ type: "workspace" as const, workspace })),
		);
	}

	const nestedChildren = withSubSections(children, descendantsByRootId);
	const workspaces = nestedChildren.flatMap((child) =>
		child.type === "workspace" ? [child.workspace] : child.section.workspaces,
	);
	return { children: nestedChildren, workspaces };
}

export interface BuildDashboardSidebarProjectsParams {
	sidebarProjects: SidebarProjectInput[];
	sidebarSections: SidebarSectionInput[];
	visibleSidebarWorkspaces: SidebarWorkspaceInput[];
	machineId: string;
	pullRequestsByWorkspaceId: Map<string, SidebarPullRequest>;
}

export function buildDashboardSidebarProjects({
	sidebarProjects,
	sidebarSections,
	visibleSidebarWorkspaces,
	machineId,
	pullRequestsByWorkspaceId,
}: BuildDashboardSidebarProjectsParams): DashboardSidebarProject[] {
	const projectsById = new Map<
		string,
		DashboardSidebarProject & {
			sectionMap: Map<string, DashboardSidebarSection>;
			descendantsByRootId: Map<string, DashboardSidebarSection[]>;
			childEntries: Array<{
				tabOrder: number;
				child: DashboardSidebarProjectChild;
			}>;
			orphanedWorkspaces: Array<{
				tabOrder: number;
				workspace: DashboardSidebarWorkspace;
			}>;
		}
	>();

	const sectionsByProjectId = new Map<string, SidebarSectionInput[]>();
	for (const section of sidebarSections) {
		const projectSections = sectionsByProjectId.get(section.projectId);
		if (projectSections) projectSections.push(section);
		else sectionsByProjectId.set(section.projectId, [section]);
	}

	for (const project of sidebarProjects) {
		const { sectionMap, roots, descendantsByRootId } = buildSectionForest(
			sectionsByProjectId.get(project.id) ?? [],
		);
		projectsById.set(project.id, {
			...project,
			children: [],
			sectionMap,
			descendantsByRootId,
			childEntries: roots.map((section) => ({
				tabOrder: section.tabOrder,
				child: { type: "section", section },
			})),
			orphanedWorkspaces: [],
		});
	}

	// One membership resolver for every pass (workspaceTagFolders): a tag
	// places the workspace in its folder; a local sectionId only counts when
	// it points at a legacy (non-tag-backed) row.
	const folderIndexByProjectId = new Map<string, Map<string, TagFolderRef>>();
	const sectionIndexInputs = sidebarSections.map((section) => ({
		sectionId: section.id,
		projectId: section.projectId,
		tabOrder: section.tabOrder,
		tag: section.tag,
	}));
	for (const project of sidebarProjects) {
		folderIndexByProjectId.set(
			project.id,
			getProjectFolderTagIndex(sectionIndexInputs, project.id),
		);
	}
	const emptyFolderIndex = new Map<string, TagFolderRef>();

	for (const workspace of visibleSidebarWorkspaces) {
		// Sessions render in the top-level Sessions section, never in a
		// project group (see buildDashboardSidebarSessionWorkspaces).
		if (workspace.projectId === null) continue;
		const project = projectsById.get(workspace.projectId);
		if (!project) continue;

		const sidebarWorkspace = decorateSidebarWorkspace(
			workspace,
			project,
			machineId,
			pullRequestsByWorkspaceId,
		);

		const effectiveSectionId = resolveWorkspaceSectionId({
			tags: workspace.tags,
			localSectionId: workspace.sectionId,
			index:
				folderIndexByProjectId.get(workspace.projectId) ?? emptyFolderIndex,
		});

		if (effectiveSectionId) {
			const section = project.sectionMap.get(effectiveSectionId);
			if (section) {
				section.workspaces.push({
					...sidebarWorkspace,
					accentColor: section.color,
				});
				continue;
			}
			project.orphanedWorkspaces.push({
				tabOrder: workspace.tabOrder,
				workspace: sidebarWorkspace,
			});
			continue;
		}

		project.childEntries.push({
			tabOrder: workspace.tabOrder,
			child: {
				type: "workspace",
				workspace: sidebarWorkspace,
			},
		});
	}

	return sidebarProjects.flatMap((project) => {
		const resolvedProject = projectsById.get(project.id);
		if (!resolvedProject) return [];
		const {
			childEntries,
			sectionMap: _sectionMap,
			descendantsByRootId,
			orphanedWorkspaces,
			...sidebarProject
		} = resolvedProject;

		const compareByTabOrder = (
			left: { tabOrder: number },
			right: { tabOrder: number },
		) => left.tabOrder - right.tabOrder;

		const sortedChildren = childEntries
			.sort(compareByTabOrder)
			.map(({ child }) => child);

		// Section membership is explicit (sectionId): an ungrouped workspace
		// keeps its top-level slot even when its tabOrder places it below a
		// section header — groups reorder like any other item, so ungrouped
		// rows and sections interleave freely.
		const children: DashboardSidebarProjectChild[] = [...sortedChildren];

		if (orphanedWorkspaces.length > 0) {
			const firstSectionIndex = children.findIndex(
				(child) => child.type === "section",
			);
			const insertIndex =
				firstSectionIndex === -1 ? children.length : firstSectionIndex;
			children.splice(
				insertIndex,
				0,
				...orphanedWorkspaces.sort(compareByTabOrder).map(({ workspace }) => ({
					type: "workspace" as const,
					workspace,
				})),
			);
		}

		sidebarProject.children = withSubSections(children, descendantsByRootId);
		return [sidebarProject];
	});
}
