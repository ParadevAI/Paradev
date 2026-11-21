import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { apiClient } from "@/lib/trpc/client";
import type { UseAttachmentFile } from "./useAttachmentFile.types";

function blobOf(base64: string, mediaType: string): Blob {
	const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
	return new Blob([bytes], { type: mediaType });
}

/** A sent attachment as an object URL, fetched once. */
export const useAttachmentFile: UseAttachmentFile = ({
	hostUrl,
	source: { fileId, attachmentId },
	mediaType,
}) =>
	useQuery({
		queryKey: fileId
			? ["attachment-file", "cloud", fileId]
			: ["attachment-file", hostUrl, attachmentId],
		enabled:
			Boolean(fileId) || (hostUrl !== undefined && Boolean(attachmentId)),
		retry: 1,
		networkMode: "always" as const,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		queryFn: async () => {
			if (fileId) {
				const [resolved] = await apiClient.attachment.resolveEach.mutate({
					fileIds: [fileId],
				});
				if (!resolved || !("url" in resolved))
					throw new Error("Attachment is gone");
				const response = await fetch(resolved.url);
				if (!response.ok) throw new Error("Attachment is gone");
				return URL.createObjectURL(await response.blob());
			}
			if (!hostUrl || !attachmentId) throw new Error("no host");
			const { data } = await getHostServiceClientByUrl(
				hostUrl,
			).attachments.read.query({ attachmentId });
			return URL.createObjectURL(blobOf(data, mediaType));
		},
	});
