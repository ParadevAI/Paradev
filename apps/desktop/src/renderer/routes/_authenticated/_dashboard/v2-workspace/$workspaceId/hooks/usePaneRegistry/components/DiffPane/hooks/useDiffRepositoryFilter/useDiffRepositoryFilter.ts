import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useWorkspaceLocalStateRow } from "../../../../../../state/activeRepositoryStore";

const ALL: string[] = [];

/** The checkouts a multi-repo Changes pane shows; empty shows them all. */
export function useDiffRepositoryFilter(
	workspaceId: string,
): [string[], (repositoryIds: string[]) => void] {
	const collections = useCollections();
	const picked =
		useWorkspaceLocalStateRow(workspaceId)?.diffRepositoryIds ?? ALL;
	const setPicked = useCallback(
		(repositoryIds: string[]) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.diffRepositoryIds = repositoryIds;
			});
		},
		[collections, workspaceId],
	);
	return [picked, setPicked];
}
