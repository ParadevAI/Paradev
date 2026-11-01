import type {
	AppCollections,
	WorkspaceCreateMutationMetadata,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { updateWorkspaceViewWhenReady } from "renderer/routes/_authenticated/providers/CollectionsProvider/workspaceViews";
import { getAreaLayout, withAreaLayout } from "shared/workspace-views";
import { appendLaunchesToPaneLayout } from "./appendLaunchesToPaneLayout";

type HostWorkspacesCreateResult = NonNullable<
	WorkspaceCreateMutationMetadata["result"]
>;

/**
 * Insert the workspace's sidebar row if it has none, and fold any launched
 * terminals/agents into its view's main area. Called once up-front (with no
 * launches) so the workspace shows in the sidebar while it syncs, then again
 * with the host-service result once the create resolves.
 */
export function writeWorkspacePaneLayout(
	collections: AppCollections,
	// projectId null = project-less "session" workspace.
	workspace: { id: string; projectId: string | null },
	terminals: HostWorkspacesCreateResult["terminals"],
	agents: HostWorkspacesCreateResult["agents"],
): Promise<void> {
	const launched =
		terminals.length > 0 || agents.length > 0
			? updateWorkspaceViewWhenReady(collections, workspace.id, (view) =>
					withAreaLayout(
						view,
						"main",
						appendLaunchesToPaneLayout({
							existing: getAreaLayout(view, "main"),
							terminals,
							agents,
						}),
					),
				)
			: Promise.resolve();
	if (collections.v2WorkspaceLocalState.get(workspace.id)) return launched;

	const projectId = workspace.projectId;
	const topLevelItems = [
		...Array.from(collections.v2WorkspaceLocalState.state.values())
			.filter(
				(item) =>
					item.sidebarState.projectId === projectId &&
					item.sidebarState.sectionId === null &&
					isSidebarWorkspaceVisible(item),
			)
			.map((item) => ({ tabOrder: item.sidebarState.tabOrder })),
		...Array.from(collections.v2SidebarSections.state.values())
			.filter((item) => item.projectId === projectId)
			.map((item) => ({ tabOrder: item.tabOrder })),
	];
	collections.v2WorkspaceLocalState.insert({
		workspaceId: workspace.id,
		createdAt: new Date(),
		sidebarState: {
			projectId,
			tabOrder: getPrependTabOrder(topLevelItems),
			sectionId: null,
			changesFilter: { kind: "all" },
			activeTab: "changes",
			isHidden: false,
		},
		paneLayout: { version: 1, tabs: [], activeTabId: null },
		viewedFiles: [],
		recentlyViewedFiles: [],
	});
	return launched;
}
