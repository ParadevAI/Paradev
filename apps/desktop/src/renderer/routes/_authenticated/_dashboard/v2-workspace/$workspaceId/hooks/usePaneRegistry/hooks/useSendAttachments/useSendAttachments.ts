import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useRef } from "react";
import { createAttachmentDeps } from "../../utils/createAttachmentDeps";
import { sendAttachmentsToWorkspace } from "../../utils/sendAttachmentsToWorkspace";
import { useAttachmentHome } from "../useAttachmentHome";

/**
 * A stable function that gets files into the workspace's worktree and
 * returns their worktree-relative paths. Stable so a terminal's paste
 * override, registered once, always sees the current host target.
 */
export function useSendAttachments(
	workspaceId: string,
): (files: File[]) => Promise<string[]> {
	const { home } = useAttachmentHome(workspaceId);
	const homeRef = useRef(home);
	homeRef.current = home;
	const host = workspaceTrpc.useUtils().client;
	const hostRef = useRef(host);
	hostRef.current = host;

	return useCallback(
		(files: File[]) => {
			if (!homeRef.current)
				return Promise.reject(new Error("Workspace host is not ready yet"));
			return sendAttachmentsToWorkspace({
				deps: createAttachmentDeps(hostRef.current),
				home: homeRef.current,
				workspaceId,
				files,
			});
		},
		[workspaceId],
	);
}
