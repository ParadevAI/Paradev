import {
	MAX_ATTACHMENTS,
	MAX_THUMBNAIL_BYTES,
} from "@superset/shared/attachment-limits";
import type { QueryClient } from "@tanstack/react-query";
import type { AttachmentPart } from "../../../../utils/sendAttachmentsToWorkspace";

/** A part names its bytes by one identity; `fileId` wins, like every reader. */
export function attachmentSourceKey(part: AttachmentPart) {
	return part.fileId
		? (["attachment", "cloud", part.fileId] as const)
		: (["attachment", "host", part.attachmentId ?? ""] as const);
}

export function isThumbnailable(part: AttachmentPart): boolean {
	return (
		part.mimeType.startsWith("image/") &&
		(part.sizeBytes ?? 0) <= MAX_THUMBNAIL_BYTES
	);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			typeof reader.result === "string"
				? resolve(reader.result)
				: reject(new Error("Unexpected file reader result"));
		reader.onerror = () =>
			reject(reader.error ?? new Error("Failed to read file"));
		reader.readAsDataURL(blob);
	});
}

/** The row for a message just sent shows the file attached, not a read back. */
export async function primeAttachmentSource(
	queryClient: QueryClient,
	part: AttachmentPart,
	file: File,
): Promise<void> {
	if (!isThumbnailable(part)) return;
	queryClient.setQueryData(
		attachmentSourceKey(part),
		await blobToDataUrl(file),
	);
}

type ResolveEach = (
	fileIds: string[],
) => Promise<
	Array<{ fileId: string; url: string } | { fileId: string; missing: true }>
>;

/**
 * Coalesces the reads a transcript makes as it renders, so its visible
 * thumbnails resolve in a few calls rather than one each.
 */
export function createCloudUrlResolver(resolveEach: ResolveEach) {
	let pending = new Map<string, Array<(url: string | null) => void>>();

	const flush = async () => {
		const batch = pending;
		pending = new Map();
		const ids = [...batch.keys()];
		for (let start = 0; start < ids.length; start += MAX_ATTACHMENTS) {
			const chunk = ids.slice(start, start + MAX_ATTACHMENTS);
			const answers = await resolveEach(chunk).catch(() => []);
			const urls = new Map(
				answers.flatMap((answer) =>
					"url" in answer ? [[answer.fileId, answer.url] as const] : [],
				),
			);
			for (const fileId of chunk) {
				for (const settle of batch.get(fileId) ?? [])
					settle(urls.get(fileId) ?? null);
			}
		}
	};

	return (fileId: string): Promise<string | null> =>
		new Promise((resolve) => {
			if (pending.size === 0) queueMicrotask(() => void flush());
			pending.set(fileId, [...(pending.get(fileId) ?? []), resolve]);
		});
}

/**
 * Where a part's bytes come from: storage for a cloud part, so no box is
 * needed; the host for a host part, the only place they exist.
 */
export async function readAttachmentSource(
	part: AttachmentPart,
	readers: {
		cloudUrl: (fileId: string) => Promise<string | null>;
		fetchBlob: (url: string) => Promise<Blob | null>;
		hostRead: (
			attachmentId: string,
		) => Promise<{ mediaType: string; data: string }>;
	},
): Promise<string | null> {
	if (part.fileId) {
		const url = await readers.cloudUrl(part.fileId);
		const blob = url ? await readers.fetchBlob(url) : null;
		return blob ? blobToDataUrl(blob) : null;
	}
	if (!part.attachmentId) return null;
	const read = await readers.hostRead(part.attachmentId);
	return `data:${read.mediaType};base64,${read.data}`;
}
