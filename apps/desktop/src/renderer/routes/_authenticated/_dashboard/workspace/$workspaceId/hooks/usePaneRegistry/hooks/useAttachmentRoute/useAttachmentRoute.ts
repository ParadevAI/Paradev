import { workspaceTrpc } from "@superset/workspace-client";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import type { AttachmentRoute } from "../../utils/sendAttachmentsToWorkspace";

/**
 * Where this workspace's attachments go. Null until the host is known: an
 * unresolved target must not fall through to storage, since it may be this
 * machine.
 */
export function useAttachmentRoute(workspaceId: string): {
	route: AttachmentRoute | null;
	hostUrl: string | null;
	worktreePath: string | undefined;
} {
	const target = useWorkspaceHostTarget(workspaceId);
	const { data: workspace } = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspace?.worktreePath;
	if (target.status === "local-starting")
		return { route: "same-machine", hostUrl: null, worktreePath };
	if (target.status !== "ready")
		return { route: null, hostUrl: null, worktreePath };
	return {
		route:
			target.kind === "local"
				? "same-machine"
				: target.kind === "sandbox"
					? "cloud"
					: "remote",
		hostUrl: target.url,
		worktreePath,
	};
}
