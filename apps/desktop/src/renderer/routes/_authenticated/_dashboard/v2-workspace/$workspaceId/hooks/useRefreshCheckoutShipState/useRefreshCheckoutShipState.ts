import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { refreshCheckoutShipState } from "./utils/refreshCheckoutShipState";

export function useRefreshCheckoutShipState(
	workspaceId: string,
	repositoryId: string | undefined,
): () => void {
	const utils = workspaceTrpc.useUtils();
	return useCallback(
		() => refreshCheckoutShipState(utils.git, workspaceId, repositoryId),
		[utils, workspaceId, repositoryId],
	);
}
