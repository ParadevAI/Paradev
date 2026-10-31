import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import type { UseAttachmentFile } from "./useAttachmentFile.types";

function blobOf(base64: string, mediaType: string): Blob {
	const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
	return new Blob([bytes], { type: mediaType });
}

/** A sent attachment as an object URL, fetched from the host once. */
export const useAttachmentFile: UseAttachmentFile = ({
	hostUrl,
	attachmentId,
	mediaType,
}) =>
	useQuery({
		queryKey: ["attachment-file", hostUrl, attachmentId],
		enabled: hostUrl !== undefined,
		retry: 1,
		networkMode: "always" as const,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		queryFn: async () => {
			if (!hostUrl) throw new Error("no host");
			const { data } = await getHostServiceClientByUrl(
				hostUrl,
			).attachments.read.query({ attachmentId });
			return URL.createObjectURL(blobOf(data, mediaType));
		},
	});
