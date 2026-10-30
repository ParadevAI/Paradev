import { useQuery } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import type { UseAttachmentFile } from "./useAttachmentFile.types";

function fileNameOf(name: string, mediaType: string): string {
	const cleaned = name.replace(/[/\\:]/g, "_").trim();
	const base = /^\.*$/.test(cleaned) ? "attachment" : cleaned;
	if (base.includes(".")) return base;
	return `${base}.${mediaType.split("/")[1]?.split("+")[0] || "bin"}`;
}

/**
 * A sent attachment as a local file, fetched from the host once. It keeps
 * the original name: viewers pick a renderer by extension and show the name.
 */
export const useAttachmentFile: UseAttachmentFile = ({
	hostUrl,
	attachmentId,
	name,
	mediaType,
}) =>
	useQuery({
		queryKey: ["attachment-file", hostUrl, attachmentId],
		enabled: hostUrl !== undefined,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl) throw new Error("no host");
			const directory = new Directory(
				Paths.cache,
				"sent-attachments",
				attachmentId,
			);
			directory.create({ idempotent: true, intermediates: true });
			const file = new File(directory, fileNameOf(name, mediaType));
			if (!file.exists) {
				const { data } = await getHostServiceClientByUrl(
					hostUrl,
				).attachments.read.query({ attachmentId });
				file.write(data, { encoding: "base64" });
			}
			return file.uri;
		},
	});
