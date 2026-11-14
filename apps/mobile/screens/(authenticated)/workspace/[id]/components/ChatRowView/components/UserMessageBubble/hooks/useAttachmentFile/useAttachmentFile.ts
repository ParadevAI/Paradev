import { useQuery } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { apiClient } from "@/lib/trpc/client";
import type { UseAttachmentFile } from "./useAttachmentFile.types";

function fileNameOf(name: string, mediaType: string): string {
	const cleaned = name.replace(/[/\\:]/g, "_").trim();
	const base = /^\.*$/.test(cleaned) ? "attachment" : cleaned;
	if (base.includes(".")) return base;
	return `${base}.${mediaType.split("/")[1]?.split("+")[0] || "bin"}`;
}

/**
 * A sent attachment as a local file, fetched once. A cloud part comes from
 * storage, so it shows without the box; a host part from the host, the only
 * place its bytes exist. It keeps the original name: viewers pick a renderer
 * by extension and show the name.
 */
export const useAttachmentFile: UseAttachmentFile = ({
	hostUrl,
	source: { fileId, attachmentId },
	name,
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
		queryFn: async () => {
			const id = fileId ?? attachmentId;
			if (!id) throw new Error("no source");
			const directory = new Directory(Paths.cache, "sent-attachments", id);
			directory.create({ idempotent: true, intermediates: true });
			const file = new File(directory, fileNameOf(name, mediaType));
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
