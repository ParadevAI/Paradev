import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { pendingCloudChatPane } from "renderer/stores/workspace-creates/pendingCloudChat";
import { getAreaLayout } from "shared/workspace-views";

export function usePendingCloudChat(workspaceId: string) {
	const collections = useCollections();
	const { data: views = [], isReady } = useLiveQuery(
		(query) =>
			query
				.from({ view: collections.v2WorkspaceViews })
				.where(({ view }) => eq(view.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const view = isReady
		? views.find((candidate) => candidate.workspaceId === workspaceId)
		: collections.v2WorkspaceViews.get(workspaceId);
	return pendingCloudChatPane(view ? getAreaLayout(view, "main") : undefined);
}
