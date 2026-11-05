import { useQuery } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { apiClient } from "@/lib/trpc/client";

function extensionOf(name: string, mediaType: string): string {
	const fromName = name.includes(".") ? name.split(".").pop() : undefined;
	return fromName || mediaType.split("/")[1]?.split("+")[0] || "bin";
}

/** Which copy of a sent attachment to fetch; a path tag has neither. */
export interface AttachmentSource {
	fileId?: string;
	attachmentId?: string;
}

/**
 * A sent attachment as a local file, fetched once. A cloud part comes from
 * storage, so it shows without the box; a host part from the host, the only
 * place its bytes exist. QuickLook picks a renderer by extension, so the file
 * keeps the original one.
 */
export function useAttachmentFile({
	hostUrl,
	source,
	name,
	mediaType,
}: {
	hostUrl: string | undefined;
	source: AttachmentSource;
	name: string;
	mediaType: string;
}) {
	const { fileId, attachmentId } = source;
	return useQuery({
		queryKey: fileId
			? ["attachment-file", "cloud", fileId]
			: ["attachment-file", hostUrl, attachmentId],
		enabled:
			Boolean(fileId) || (hostUrl !== undefined && Boolean(attachmentId)),
		retry: 1,
		networkMode: "always" as const,
		queryFn: async () => {
			const directory = new Directory(Paths.cache, "sent-attachments");
			directory.create({ idempotent: true });
			const file = new File(
				directory,
				`${fileId ?? attachmentId}.${extensionOf(name, mediaType)}`,
			);
			if (file.exists) return file.uri;
			if (fileId) {
				const [resolved] = await apiClient.attachment.resolveEach.mutate({
					fileIds: [fileId],
				});
				if (!resolved || !("url" in resolved))
					throw new Error("Attachment is gone");
				await File.downloadFileAsync(resolved.url, file);
				return file.uri;
			}
			if (!hostUrl || !attachmentId) throw new Error("no host");
			const { data } = await getHostServiceClientByUrl(
				hostUrl,
			).attachments.read.query({ attachmentId });
			file.write(data, { encoding: "base64" });
			return file.uri;
		},
	});
}
