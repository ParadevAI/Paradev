import { workspaceTrpc } from "@superset/workspace-client";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";

/**
 * Binary previews of the index or HEAD side don't change their query key
 * when git state moves, so refetch them on git events. Scope to the reported
 * paths when we have them so an unrelated edit doesn't refetch every preview
 * on screen. The working-tree side follows the shared document store's fs
 * watch and needs nothing here.
 */
export function BinaryPreviewRefresh({ workspaceId }: { workspaceId: string }) {
	const utils = workspaceTrpc.useUtils();
	useWorkspaceEvent("git:changed", workspaceId, ({ paths }) => {
		if (!paths) {
			void utils.git.readDiffSideFile.invalidate({ workspaceId });
			return;
		}
		for (const path of paths) {
			void utils.git.readDiffSideFile.invalidate({ workspaceId, path });
		}
	});
	return null;
}
