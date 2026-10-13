import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	deriveSessionTagFolders,
	deriveTagFolders,
	orderFolderTree,
	useTagFolderContext,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";

export interface ProjectTagFolderSection {
	id: string;
	name: string;
	color: string | null;
	/** 0 for a top-level folder; menus indent sub-folders by it. */
	depth: number;
}

/**
 * A project's folder list for menus ("Move to group" etc.) — the
 * deriveTagFolders union, NOT the stored rows: a folder that exists only
 * because a workspace carries the tag must be a valid move target, or
 * agent-created folders can't be targeted at all.
 */
export function useProjectTagFolderSections(projectId: string | null): {
	sections: ProjectTagFolderSection[];
	areSectionsReady: boolean;
} {
	const collections = useCollections();
	const { workspaces: hostWorkspaces, isReady: hostWorkspacesReady } =
		useHostWorkspaces();
	const tagFolderContext = useTagFolderContext();
	const { data: storedSections = [], isReady } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.select(({ sidebarSections }) => ({
					sectionId: sidebarSections.sectionId,
					projectId: sidebarSections.projectId,
					name: sidebarSections.name,
					createdAt: sidebarSections.createdAt,
					isCollapsed: sidebarSections.isCollapsed,
					tabOrder: sidebarSections.tabOrder,
					color: sidebarSections.color,
					tag: sidebarSections.tag,
				})),
		[collections],
	);
	const sections = useMemo(() => {
		if (projectId === null) {
			return deriveSessionTagFolders(
				hostWorkspaces,
				tagFolderContext.tagSettings,
			).map(({ tag, name, color }) => ({ id: tag, name, color, depth: 0 }));
		}
		const folders = deriveTagFolders(
			storedSections,
			hostWorkspaces,
			tagFolderContext,
		)
			.filter((section) => section.projectId === projectId)
			.map((section) => ({ ...section, id: section.sectionId }));
		return orderFolderTree(
			folders,
			(left, right) =>
				left.tabOrder - right.tabOrder || left.id.localeCompare(right.id),
		).map(({ folder, depth }) => ({
			id: folder.id,
			name: folder.name,
			color: folder.color,
			depth,
		}));
	}, [projectId, storedSections, hostWorkspaces, tagFolderContext]);
	// Derived folders come from host rows, so "ready" needs the host fan-out
	// too — otherwise the menu claims a complete list before tags arrive.
	return { sections, areSectionsReady: isReady && hostWorkspacesReady };
}
