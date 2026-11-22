import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo, useRef } from "react";
import { useRecentlyViewedFiles } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useRecentlyViewedFiles";

export interface WorkspacePathHost {
	stat: (
		path: string,
	) => Promise<{ resolvedPath: string; isDirectory: boolean } | null>;
	/** The file a shortened or misplaced path most plausibly means. */
	resolveFile: (reference: string) => Promise<{ resolvedPath: string } | null>;
}

/**
 * How agent output (terminal, chat) asks the workspace host about a path.
 * The returned object is stable, so link handlers can keep it.
 */
export function useWorkspacePathHost(workspaceId: string): WorkspacePathHost {
	// statPath is a mutation (POST): a GET puts the path in the URL, and tRPC
	// mangles paths with characters like ().
	const statPath = workspaceTrpc.filesystem.statPath.useMutation();
	const hostClient = workspaceTrpc.useUtils().client;
	const { recentFiles } = useRecentlyViewedFiles(workspaceId);

	const calls: WorkspacePathHost = {
		stat: (path) => statPath.mutateAsync({ workspaceId, path }),
		resolveFile: (reference) =>
			hostClient.filesystem.resolveFileReference.query({
				workspaceId,
				reference,
				preferredRelativePaths: recentFiles.map((file) => file.relativePath),
			}),
	};
	const latest = useRef(calls);
	latest.current = calls;
	return useMemo(
		() => ({
			stat: (path) => latest.current.stat(path),
			resolveFile: (reference) => latest.current.resolveFile(reference),
		}),
		[],
	);
}
