import { workspaceTrpc } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import type { AttachmentPart } from "../../../../../../utils/sendAttachmentsToWorkspace";
import {
	attachmentSourceKey,
	createCloudUrlResolver,
	isThumbnailable,
	readAttachmentSource,
} from "../../../../utils/attachmentSource";

const resolveCloudUrl = createCloudUrlResolver((fileIds) =>
	apiTrpcClient.attachment.resolveEach.mutate({ fileIds }),
);

const HOUR_MS = 60 * 60 * 1000;

/** A data URL for an attachment part's thumbnail, or null for a name badge. */
export function useAttachmentSource(part: AttachmentPart): {
	src: string | null;
	isLoading: boolean;
} {
	const host = workspaceTrpc.useUtils().client;
	const showable =
		isThumbnailable(part) && Boolean(part.fileId || part.attachmentId);
	const query = useQuery({
		queryKey: attachmentSourceKey(part),
		enabled: showable,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: HOUR_MS,
		retry: 1,
		queryFn: () =>
			readAttachmentSource(part, {
				cloudUrl: resolveCloudUrl,
				fetchBlob: async (url) => {
					const response = await fetch(url);
					return response.ok ? response.blob() : null;
				},
				hostRead: (attachmentId) =>
					host.attachments.read.query({ attachmentId }),
			}),
	});
	return {
		src: showable ? (query.data ?? null) : null,
		isLoading: showable && query.isPending,
	};
}
