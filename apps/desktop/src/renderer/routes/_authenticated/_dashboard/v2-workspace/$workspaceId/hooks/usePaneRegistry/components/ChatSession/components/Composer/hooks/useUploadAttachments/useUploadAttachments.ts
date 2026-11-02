import { useLingui } from "@lingui/react/macro";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { hostReadsAttachmentParts } from "@superset/shared/host-version";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useHostServiceInfo } from "renderer/hooks/host-service/useHostServiceInfo";
import { track } from "renderer/lib/analytics";
import { useAttachmentRoute } from "../../../../../../hooks/useAttachmentRoute";
import { useSendAttachments } from "../../../../../../hooks/useSendAttachments";
import { createAttachmentDeps } from "../../../../../../utils/createAttachmentDeps";
import {
	AttachmentLimitError,
	type AttachmentPart,
	AttachmentSourceError,
	assertWithinLimits,
	fitsInline,
	sendAttachments,
} from "../../../../../../utils/sendAttachmentsToWorkspace";
import { primeAttachmentSource } from "../../../../utils/attachmentSource";
import { formatAttachmentTag } from "../../../../utils/attachmentTags";

export type UploadAttachmentsResult =
	| { ok: true; tags: string[]; parts: AttachmentPart[] }
	| { ok: false; keep: File[] };

/**
 * Chat attachments as parts when the host's adapters read them; this
 * machine's host is this build. A file on this machine too big for a part is
 * copied into the worktree and goes as a path tag, so it never needs a cap.
 * A remote host or box below the floor gets path tags for everything.
 */
export function useUploadAttachments(workspaceId: string) {
	const { t } = useLingui();
	const { route, hostUrl, worktreePath } = useAttachmentRoute(workspaceId);
	const remoteInfo = useHostServiceInfo(
		route === "same-machine" ? null : hostUrl,
	);
	const readsParts =
		route === "same-machine" ||
		hostReadsAttachmentParts(remoteInfo.data?.version);
	const sendPaths = useSendAttachments(workspaceId);
	const host = workspaceTrpc.useUtils().client;
	const queryClient = useQueryClient();

	return useCallback(
		async (files: File[]): Promise<UploadAttachmentsResult> => {
			if (files.length === 0) return { ok: true, tags: [], parts: [] };
			const describe = (error: unknown): string => {
				if (error instanceof AttachmentLimitError) return error.message;
				if (error instanceof AttachmentSourceError) {
					const name = error.fileName;
					switch (error.problem) {
						case "missing":
							return t({
								message: `"${name}" was moved or deleted. Attach it again.`,
							});
						case "not-a-file":
							return t({
								message: `"${name}" is a folder. Attach the files inside it instead.`,
							});
						case "unreadable":
							return t({
								message: `Paradev doesn't have permission to read "${name}".`,
							});
					}
				}
				return errorMessage(error, t({ message: "Unknown error" }));
			};
			const asParts =
				route && readsParts
					? route === "same-machine"
						? files.filter(fitsInline)
						: files
					: [];
			const asPaths = files.filter((file) => !asParts.includes(file));
			try {
				assertWithinLimits(files, Number.POSITIVE_INFINITY);
				const parts =
					route && asParts.length > 0
						? await sendAttachments({
								deps: createAttachmentDeps({ host, route, worktreePath }),
								route,
								workspaceId,
								files: asParts,
								onSent: (part, file) =>
									void primeAttachmentSource(queryClient, part, file),
							})
						: [];
				const paths = await sendPaths(asPaths);
				track("attachments_sent", {
					surface: "chat",
					route,
					parts: parts.length,
					paths: paths.length,
				});
				return {
					ok: true,
					parts,
					tags: paths.map((path, index) =>
						formatAttachmentTag({
							path,
							type: asPaths[index]?.type ?? "",
							name: asPaths[index]?.name,
						}),
					),
				};
			} catch (error) {
				if (
					!(error instanceof AttachmentLimitError) &&
					!(error instanceof AttachmentSourceError)
				) {
					track("attachments_send_failed", {
						surface: "chat",
						route,
						error: rawErrorMessage(error),
					});
				}
				toast.error(t({ message: "Couldn't attach files" }), {
					description: describe(error),
				});
				const bad =
					error instanceof AttachmentSourceError
						? asPaths[error.index]
						: undefined;
				return {
					ok: false,
					keep: bad ? files.filter((file) => file !== bad) : files,
				};
			}
		},
		[
			host,
			queryClient,
			readsParts,
			route,
			sendPaths,
			t,
			workspaceId,
			worktreePath,
		],
	);
}
