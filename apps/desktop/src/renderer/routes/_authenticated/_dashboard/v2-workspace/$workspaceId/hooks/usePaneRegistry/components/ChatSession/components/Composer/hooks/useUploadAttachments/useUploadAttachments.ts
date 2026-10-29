import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	PasteUploadLimitError,
	uploadPastedFiles,
} from "../../../../../../utils/uploadPastedFiles";
import { formatAttachmentTag } from "../../../../utils/attachmentTags";

export function useUploadAttachments(workspaceId: string) {
	const { t } = useLingui();
	const { data: workspace } = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const createDirectory =
		workspaceTrpc.filesystem.createDirectory.useMutation();
	const writeFile = workspaceTrpc.filesystem.writeFile.useMutation();
	const worktreePath = workspace?.worktreePath;
	const { machineId } = useLocalHostService();
	const { workspaces } = useHostWorkspaces();
	const isLocal =
		Boolean(machineId) &&
		workspaces.find((w) => w.id === workspaceId)?.hostId === machineId;

	return useCallback(
		async (files: File[]): Promise<string[] | null> => {
			if (files.length === 0) return [];
			try {
				if (!worktreePath) throw new Error("Workspace is not ready");
				const paths = await uploadPastedFiles({
					deps: {
						createDirectory: (input) => createDirectory.mutateAsync(input),
						writeFile: (input) => writeFile.mutateAsync(input),
						local: isLocal
							? {
									pathOf: (file) => window.webUtils.getPathForFile(file),
									copyFile: (input) =>
										electronTrpcClient.attachments.copyLocalFile.mutate(input),
								}
							: undefined,
					},
					workspaceId,
					worktreePath,
					files,
				});
				return paths.map((path, index) =>
					formatAttachmentTag({ path, type: files[index]?.type ?? "" }),
				);
			} catch (error) {
				toast.error(t({ message: "Couldn't attach files" }), {
					description:
						error instanceof PasteUploadLimitError
							? error.message
							: errorMessage(error, t({ message: "Unknown error" })),
				});
				return null;
			}
		},
		[worktreePath, workspaceId, isLocal, createDirectory, writeFile, t],
	);
}
