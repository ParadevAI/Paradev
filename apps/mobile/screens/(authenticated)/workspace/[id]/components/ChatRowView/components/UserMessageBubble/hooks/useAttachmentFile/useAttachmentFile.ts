import { useQuery } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";

function extensionOf(name: string, mediaType: string): string {
	const fromName = name.includes(".") ? name.split(".").pop() : undefined;
	return fromName || mediaType.split("/")[1]?.split("+")[0] || "bin";
}

/**
 * A sent attachment as a local file, fetched from the host once. QuickLook
 * picks a renderer by extension, so the file keeps the original one.
 */
export function useAttachmentFile({
	hostUrl,
	attachmentId,
	name,
	mediaType,
}: {
	hostUrl: string | undefined;
	attachmentId: string;
	name: string;
	mediaType: string;
}) {
	return useQuery({
		queryKey: ["attachment-file", hostUrl, attachmentId],
		enabled: hostUrl !== undefined,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl) throw new Error("no host");
			const directory = new Directory(Paths.cache, "sent-attachments");
			directory.create({ idempotent: true });
			const file = new File(
				directory,
				`${attachmentId}.${extensionOf(name, mediaType)}`,
			);
			if (!file.exists) {
				const { data } = await getHostServiceClientByUrl(
					hostUrl,
				).attachments.read.query({ attachmentId });
				file.write(data, { encoding: "base64" });
			}
			return file.uri;
		},
	});
}
