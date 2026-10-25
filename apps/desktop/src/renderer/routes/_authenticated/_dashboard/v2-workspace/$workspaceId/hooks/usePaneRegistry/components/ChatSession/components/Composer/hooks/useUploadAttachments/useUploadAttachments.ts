import { useLingui } from "@lingui/react/macro";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { hostReadsAttachmentParts } from "@superset/shared/host-version";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useHostServiceInfo } from "renderer/hooks/host-service/useHostServiceInfo";
import { track } from "renderer/lib/analytics";
import { useAttachmentHome } from "../../../../../../hooks/useAttachmentHome";
import { useSendAttachments } from "../../../../../../hooks/useSendAttachments";
import { createAttachmentDeps } from "../../../../../../utils/createAttachmentDeps";
import {
	AttachmentLimitError,
	type AttachmentPart,
	sendAttachments,
} from "../../../../../../utils/sendAttachmentsToWorkspace";
import { primeAttachmentSource } from "../../../../utils/attachmentSource";
import { formatAttachmentTag } from "../../../../utils/attachmentTags";

export type UploadedAttachments =
	| { kind: "parts"; parts: AttachmentPart[] }
	| { kind: "tags"; tags: string[] };

/**
 * Chat attachments as parts when the host's adapters read them. A local host
 * is this build; a remote host or a box below the floor gets path tags.
 */
export function useUploadAttachments(workspaceId: string) {
	const { t } = useLingui();
	const { home, hostKind, hostUrl } = useAttachmentHome(workspaceId);
	const remoteInfo = useHostServiceInfo(hostKind === "local" ? null : hostUrl);
	const readsParts =
		hostKind === "local" || hostReadsAttachmentParts(remoteInfo.data?.version);
	const sendPaths = useSendAttachments(workspaceId);
	const host = workspaceTrpc.useUtils().client;
	const queryClient = useQueryClient();

	return useCallback(
		async (files: File[]): Promise<UploadedAttachments | null> => {
			if (files.length === 0) return { kind: "tags", tags: [] };
			try {
				if (home && readsParts) {
					const parts = await sendAttachments({
						deps: createAttachmentDeps(host),
						home,
						workspaceId,
						files,
						onSent: (part, file) =>
							void primeAttachmentSource(queryClient, part, file),
					});
					track("attachments_sent", {
						surface: "chat",
						home,
						host_kind: hostKind,
						count: parts.length,
					});
					return { kind: "parts", parts };
				}
				const paths = await sendPaths(files);
				return {
					kind: "tags",
					tags: paths.map((path, index) =>
						formatAttachmentTag({ path, type: files[index]?.type ?? "" }),
					),
				};
			} catch (error) {
				if (!(error instanceof AttachmentLimitError)) {
					track("attachments_send_failed", {
						surface: "chat",
						home,
						host_kind: hostKind,
						error: rawErrorMessage(error),
					});
				}
				toast.error(t({ message: "Couldn't attach files" }), {
					description:
						error instanceof AttachmentLimitError
							? error.message
							: errorMessage(error, t({ message: "Unknown error" })),
				});
				return null;
			}
		},
		[home, hostKind, host, queryClient, readsParts, sendPaths, t, workspaceId],
	);
}
