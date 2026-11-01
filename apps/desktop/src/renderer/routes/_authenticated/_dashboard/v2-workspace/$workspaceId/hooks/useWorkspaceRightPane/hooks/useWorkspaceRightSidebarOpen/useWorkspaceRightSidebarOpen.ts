import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { updateWorkspaceView } from "renderer/routes/_authenticated/providers/CollectionsProvider/workspaceViews";
import {
	isRightPaneOpen,
	withRightPaneFullScreenToggled,
	withRightPaneVisibility,
} from "shared/workspace-views";

type SetOpen = (next: boolean | ((prev: boolean) => boolean)) => void;

export function useWorkspaceRightSidebarOpen(): {
	isOpen: boolean;
	isFullScreen: boolean;
	setOpen: SetOpen;
	toggleFullScreen: () => void;
} {
	const collections = useCollections();
	const { workspace } = useWorkspace();
	const { data: views = [] } = useLiveQuery(
		(query) =>
			query
				.from({ view: collections.v2WorkspaceViews })
				.where(({ view }) => eq(view.workspaceId, workspace.id)),
		[collections, workspace.id],
	);
	const visibility =
		views.find((view) => view.workspaceId === workspace.id)?.rightPane
			.visibility ?? "closed";

	const setOpen = useCallback<SetOpen>(
		(next) =>
			updateWorkspaceView(collections, workspace.id, (view) =>
				withRightPaneVisibility(view, {
					open: typeof next === "function" ? next(isRightPaneOpen(view)) : next,
				}),
			),
		[collections, workspace.id],
	);
	const toggleFullScreen = useCallback(
		() =>
			updateWorkspaceView(
				collections,
				workspace.id,
				withRightPaneFullScreenToggled,
			),
		[collections, workspace.id],
	);

	return {
		isOpen: visibility !== "closed",
		isFullScreen: visibility === "fullScreen",
		setOpen,
		toggleFullScreen,
	};
}
