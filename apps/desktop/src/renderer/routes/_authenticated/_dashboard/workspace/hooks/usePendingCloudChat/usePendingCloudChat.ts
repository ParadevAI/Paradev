import type { WorkspaceState } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { pendingCloudChatPane } from "renderer/stores/workspace-creates/pendingCloudChat";

export function usePendingCloudChat(workspaceId: string) {
	const collections = useCollections();
	const { data: rows = [], isReady } = useLiveQuery(
		(query) =>
			query
				.from({ local: collections.workspaceLocalState })
				.where(({ local }) => eq(local.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const row = isReady
		? rows.find((candidate) => candidate.workspaceId === workspaceId)
		: collections.workspaceLocalState.get(workspaceId);
	return pendingCloudChatPane(
		row?.paneLayout as WorkspaceState<PaneViewerData> | undefined,
	);
}
