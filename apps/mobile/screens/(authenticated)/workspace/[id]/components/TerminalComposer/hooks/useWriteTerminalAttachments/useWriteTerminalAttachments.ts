import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";
import type { PromptInputAttachmentItem } from "@/components/ai-elements/prompt-input";
import { asAttachmentError } from "@/lib/attachments/errors";
import {
	awaitAttachmentUploads,
	toAttachmentFiles,
} from "@/lib/attachments/upload";
import { writeAttachmentsToWorktree } from "@/lib/attachments/worktreeWrite";
import { errorCopy } from "@/lib/errors";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { apiClient } from "@/lib/trpc/client";

export interface TerminalAttachmentTarget {
	workspaceId: string;
	hostUrl: string;
	/** A cloud box fetches only files attached to it, so they are attached first. */
	isCloud: boolean;
	/** Which draft the attachments (and their uploads) belong to. */
	draftKey: string;
}

interface WriteArgs {
	target: TerminalAttachmentTarget;
	attachments: PromptInputAttachmentItem[];
}

/**
 * Gets composer attachments into the workspace's worktree and returns their
 * worktree-relative paths. A live PTY only takes bytes, so paths are how an
 * attachment reaches the agent.
 *
 * A box gets the bytes device → cloud storage → box; the upload started when
 * the file was attached. A machine someone owns gets them in the request,
 * under the inline cap, so they never reach our storage.
 */
export function useWriteTerminalAttachments() {
	return useMutation({
		mutationFn: async ({ target, attachments }: WriteArgs) => {
			if (attachments.length === 0) return [];
			if (!target.isCloud) {
				const client = getHostServiceClientByUrl(target.hostUrl);
				return writeAttachmentsToWorktree(toAttachmentFiles(attachments), {
					worktreePath: async () => {
						const workspace = await client.workspace.get.query({
							id: target.workspaceId,
						});
						if (!workspace?.worktreePath)
							throw new Error("Workspace path not found");
						return workspace.worktreePath;
					},
					createDirectory: (absolutePath) =>
						client.filesystem.createDirectory.mutate({
							workspaceId: target.workspaceId,
							absolutePath,
							recursive: true,
						}),
					writeFile: async ({ absolutePath, content }) =>
						(await client.filesystem.writeFile.mutate({
							workspaceId: target.workspaceId,
							absolutePath,
							content,
							options: { create: true, overwrite: false },
						})) ?? { ok: true },
				});
			}
			const fileIds = await awaitAttachmentUploads(
				target.draftKey,
				attachments,
			);
			const client = getHostServiceClientByUrl(target.hostUrl);
			try {
				await apiClient.cloudWorkspace.attachFiles.mutate({
					id: target.workspaceId,
					fileIds,
				});
				const { paths } =
					await client.attachments.materializeIntoWorkspace.mutate({
						workspaceId: target.workspaceId,
						fileIds,
					});
				return paths;
			} catch (error) {
				throw asAttachmentError(error);
			}
		},
		onError: (error) => {
			Alert.alert(
				i18n._(
					msg({
						message: "Could not attach files",
					}),
				),
				errorCopy(error),
			);
		},
	});
}
