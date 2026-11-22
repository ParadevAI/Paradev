import { readFile } from "node:fs/promises";
import type { ResolveAttachment } from "@superset/chat-runtime";
import type { AttachmentUploadResult } from "../trpc/router/attachments";
import {
	handOutAttachment,
	handOutAttachmentByFileId,
} from "../trpc/router/attachments/storage";

/**
 * One resolver for every adapter. A part names where it lives: `fileId` is a
 * cloud workspace's storage object, cached in this box's store or pulled into
 * it now (a recreated box has an empty store); `attachmentId` is the store
 * entry itself.
 */
export function createAttachmentResolver({
	importCloud,
	report,
}: {
	importCloud: (fileIds: string[]) => Promise<AttachmentUploadResult[]>;
	report: (error: unknown) => void;
}): ResolveAttachment {
	const fromCloud = async (fileId: string) => {
		const cached = handOutAttachmentByFileId(fileId);
		if (cached) return cached;
		const [imported] = await importCloud([fileId]);
		return imported ? handOutAttachment(imported.attachmentId) : null;
	};

	return async (part) => {
		try {
			const found = part.fileId
				? await fromCloud(part.fileId)
				: part.attachmentId
					? handOutAttachment(part.attachmentId)
					: null;
			if (!found) return null;
			const mimeType = found.metadata.mediaType;
			return {
				path: found.path,
				mimeType,
				data: mimeType.startsWith("image/")
					? (await readFile(found.path)).toString("base64")
					: "",
			};
		} catch (error) {
			report(error);
			return null;
		}
	};
}
