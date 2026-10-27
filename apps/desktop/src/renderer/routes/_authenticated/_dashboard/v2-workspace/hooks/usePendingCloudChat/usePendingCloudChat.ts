import type { WorkspaceState } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { pendingCloudChatPane } from "renderer/stores/workspace-creates/pendingCloudChat";

export function usePendingCloudChat(workspaceId: string) {
	const collections = useCollections();
	const { data: rows = [], isReady } = useLiveQuery(
		(query) =>
			query
				.from({ local: collections.v2WorkspaceLocalState })
				.where(({ local }) => eq(local.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const row = isReady
		? rows.find((candidate) => candidate.workspaceId === workspaceId)
		: collections.v2WorkspaceLocalState.get(workspaceId);
	return pendingCloudChatPane(
		row?.paneLayout as WorkspaceState<PaneViewerData> | undefined,
	);
}
