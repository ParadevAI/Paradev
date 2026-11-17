import type { workspaceTrpc } from "@superset/workspace-client";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { fileToBase64 } from "renderer/lib/file-to-base64";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type {
	AttachmentRoute,
	SendAttachmentsDeps,
} from "../sendAttachmentsToWorkspace";

type HostClient = ReturnType<typeof workspaceTrpc.useUtils>["client"];

export function createAttachmentDeps({
	host,
	route,
	worktreePath,
}: {
	host: HostClient;
	route: AttachmentRoute;
	worktreePath: string | undefined;
}): SendAttachmentsDeps {
	return {
		createUpload: (input) =>
			apiTrpcClient.attachment.createUpload.mutate(input),
		putObject: (target, file) =>
			fetch(target.url, { method: "PUT", headers: target.headers, body: file }),
		attachFiles: (input) =>
			apiTrpcClient.cloudWorkspace.attachFiles.mutate(input),
		materialize: (input) =>
			host.attachments.materializeIntoWorkspace.mutate(input),
		hostUpload: (input) => host.attachments.upload.mutate(input),
		worktreePath: async (workspaceId) => {
			const workspace = await host.workspace.get.query({ id: workspaceId });
			if (!workspace?.worktreePath) throw new Error("Workspace path not found");
			return workspace.worktreePath;
		},
		createDirectory: (input) => host.filesystem.createDirectory.mutate(input),
		writeFile: (input) => host.filesystem.writeFile.mutate(input),
		sameMachine:
			route === "same-machine"
				? {
						pathOf: (file) => window.webUtils.getPathForFile(file),
						readBase64: fileToBase64,
						write: (items) => {
							if (!worktreePath) throw new Error("Workspace is not ready");
							return electronTrpcClient.attachments.writeIntoWorktree.mutate({
								worktreePath,
								items,
							});
						},
					}
				: undefined,
	};
}
