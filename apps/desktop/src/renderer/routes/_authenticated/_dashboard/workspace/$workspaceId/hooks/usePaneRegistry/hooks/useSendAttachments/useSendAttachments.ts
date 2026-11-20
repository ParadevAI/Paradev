import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useRef } from "react";
import { createAttachmentDeps } from "../../utils/createAttachmentDeps";
import { sendAttachmentsToWorkspace } from "../../utils/sendAttachmentsToWorkspace";
import { useAttachmentRoute } from "../useAttachmentRoute";

/**
 * A stable function that gets files into the workspace's worktree and
 * returns their worktree-relative paths. Stable so a terminal's paste
 * override, registered once, always sees the current host target.
 */
export function useSendAttachments(
	workspaceId: string,
): (files: File[]) => Promise<string[]> {
	const attachmentRoute = useAttachmentRoute(workspaceId);
	const routeRef = useRef(attachmentRoute);
	routeRef.current = attachmentRoute;
	const host = workspaceTrpc.useUtils().client;
	const hostRef = useRef(host);
	hostRef.current = host;

	return useCallback(
		async (files: File[]) => {
			const { route, worktreePath } = routeRef.current;
			if (!route) throw new Error("Workspace is not ready");
			return sendAttachmentsToWorkspace({
				deps: createAttachmentDeps({
					host: hostRef.current,
					route,
					worktreePath,
				}),
				route,
				workspaceId,
				files,
			});
		},
		[workspaceId],
	);
}
