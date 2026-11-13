import {
	type GitChangedPayload,
	workspaceTrpc,
} from "@superset/workspace-client";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { checkoutInput } from "../../../../../../utils/checkoutInput";

/**
 * Binary previews of the index or HEAD side don't change their query key
 * when git state moves, so refetch them on git events, in the checkout the
 * event names. Scope to the reported paths when we have them so an unrelated
 * edit doesn't refetch every preview on screen. The working-tree side follows
 * the shared document store's fs watch and needs nothing here.
 */
export function BinaryPreviewRefresh({ workspaceId }: { workspaceId: string }) {
	const utils = workspaceTrpc.useUtils();
	useWorkspaceEvent(
		"git:changed",
		workspaceId,
		({ paths, repositoryId }: GitChangedPayload) => {
			const scope = checkoutInput(workspaceId, repositoryId ?? undefined);
			if (!paths) {
				void utils.git.readDiffSideFile.invalidate(scope);
				return;
			}
			for (const path of paths) {
				void utils.git.readDiffSideFile.invalidate({ ...scope, path });
			}
		},
	);
	return null;
}
