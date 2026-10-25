import type { workspaceTrpc } from "@superset/workspace-client";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import type { SendAttachmentsDeps } from "../sendAttachmentsToWorkspace";

type HostClient = ReturnType<typeof workspaceTrpc.useUtils>["client"];

export function createAttachmentDeps(host: HostClient): SendAttachmentsDeps {
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
	};
}
