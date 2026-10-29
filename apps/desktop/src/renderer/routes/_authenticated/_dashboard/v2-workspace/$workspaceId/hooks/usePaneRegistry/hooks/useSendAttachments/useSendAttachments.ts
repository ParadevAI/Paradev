import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useRef } from "react";
import {
	useWorkspaceHostTarget,
	type WorkspaceHostTarget,
} from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { fileToBase64 } from "renderer/lib/file-to-base64";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	type SendAttachmentsDeps,
	sendAttachmentsToWorkspace,
} from "../../utils/sendAttachmentsToWorkspace";

async function putObject(
	target: { url: string; headers: Record<string, string> },
	file: File,
): Promise<Response> {
	return await fetch(target.url, {
		method: "PUT",
		headers: target.headers,
		body: file,
	});
}

type Route = "same-machine" | "remote" | "cloud" | "unknown";

function routeOf(target: WorkspaceHostTarget): Route {
	if (target.status === "local-starting") return "same-machine";
	if (target.status !== "ready") return "unknown";
	if (target.kind === "local") return "same-machine";
	return target.kind === "sandbox" ? "cloud" : "remote";
}

function sameMachineDeps(
	worktreePath: string | undefined,
): SendAttachmentsDeps["sameMachine"] {
	return {
		pathOf: (file) => window.webUtils.getPathForFile(file),
		readBase64: fileToBase64,
		write: (items) => {
			if (!worktreePath) throw new Error("Workspace is not ready");
			return electronTrpcClient.attachments.writeIntoWorktree.mutate({
				worktreePath,
				items,
			});
		},
	};
}

/**
 * A stable function that gets files into the workspace's worktree and
 * returns their worktree-relative paths. Stable so a terminal's paste
 * override, registered once, always sees the current host target.
 */
export function useSendAttachments(
	workspaceId: string,
): (files: File[]) => Promise<string[]> {
	const route = routeOf(useWorkspaceHostTarget(workspaceId));
	const routeRef = useRef(route);
	routeRef.current = route;

	const { data: workspace } = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePathRef = useRef(workspace?.worktreePath);
	worktreePathRef.current = workspace?.worktreePath;

	const materialize =
		workspaceTrpc.attachments.materializeIntoWorkspace.useMutation();
	const materializeRef = useRef(materialize.mutateAsync);
	materializeRef.current = materialize.mutateAsync;

	return useCallback(
		async (files: File[]) => {
			// An unresolved target must not fall through to storage: it may be this machine.
			if (routeRef.current === "unknown") {
				throw new Error("Workspace is not ready");
			}
			return sendAttachmentsToWorkspace({
				deps: {
					createUpload: (input) =>
						apiTrpcClient.attachment.createUpload.mutate(input),
					putObject,
					attachFiles: (input) =>
						apiTrpcClient.cloudWorkspace.attachFiles.mutate(input),
					materialize: (input) => materializeRef.current(input),
					sameMachine:
						routeRef.current === "same-machine"
							? sameMachineDeps(worktreePathRef.current)
							: undefined,
				},
				workspaceId,
				isCloudWorkspace: routeRef.current === "cloud",
				files,
			});
		},
		[workspaceId],
	);
}
