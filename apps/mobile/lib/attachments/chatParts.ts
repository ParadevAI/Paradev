import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { MAX_INLINE_ATTACHMENT_BYTES } from "@superset/shared/attachment-limits";

export interface ChatAttachmentPart {
	type: "attachment";
	attachmentId?: string;
	fileId?: string;
	name: string;
	mimeType: string;
	sizeBytes?: number;
}

export interface ChatAttachmentFile {
	name: string;
	mimeType: string;
	size: number;
	readBase64: () => Promise<string>;
}

interface HostRecord {
	attachmentId: string;
	originalFilename?: string;
	mediaType: string;
	sizeBytes: number;
}

export interface ChatPartsDeps {
	/** The storage ids of the draft's uploads, waiting on any still in flight. */
	awaitUploads: () => Promise<string[]>;
	attachFiles: (fileIds: string[]) => Promise<unknown>;
	importFromCloud: (fileIds: string[]) => Promise<HostRecord[]>;
	hostUpload: (input: {
		data: { kind: "base64"; data: string };
		mediaType: string;
		originalFilename: string;
	}) => Promise<HostRecord>;
}

/** Thrown for limits the user can act on; the message is alert-ready. */
export class AttachmentLimitError extends Error {}

/** A host takes the bytes in one request body, which it holds in memory. */
export function assertFitsHost(files: ChatAttachmentFile[]): void {
	const tooLarge = files.find(
		(file) => file.size > MAX_INLINE_ATTACHMENT_BYTES,
	);
	if (!tooLarge) return;
	const name = tooLarge.name;
	const limit = `${Math.round(MAX_INLINE_ATTACHMENT_BYTES / 1024 / 1024)}MB`;
	throw new AttachmentLimitError(
		i18n._(
			msg({
				message: `"${name}" is over ${limit}, the most a workspace outside the cloud can take`,
			}),
		),
	);
}

/**
 * The parts a chat message carries, by where the workspace lives. A cloud
 * part is a storage object, so it renders without the box; a host part is in
 * that host's store, and its bytes never reach our servers. A box too old to
 * read a part by `fileId` gets the copy it imports instead.
 */
export async function chatAttachmentParts({
	home,
	readsParts,
	files,
	deps,
}: {
	home: "cloud" | "host";
	readsParts: boolean;
	files: ChatAttachmentFile[];
	deps: ChatPartsDeps;
}): Promise<ChatAttachmentPart[]> {
	if (files.length === 0) return [];
	if (home === "host") {
		assertFitsHost(files);
		return Promise.all(
			files.map(async (file) => {
				const record = await deps.hostUpload({
					data: { kind: "base64", data: await file.readBase64() },
					mediaType: file.mimeType,
					originalFilename: file.name,
				});
				return {
					type: "attachment" as const,
					attachmentId: record.attachmentId,
					name: file.name,
					mimeType: record.mediaType,
					sizeBytes: record.sizeBytes,
				};
			}),
		);
	}

	const fileIds = await deps.awaitUploads();
	await deps.attachFiles(fileIds);
	if (readsParts) {
		return fileIds.map((fileId, index) => {
			const file = files[index] as ChatAttachmentFile;
			return {
				type: "attachment",
				fileId,
				name: file.name,
				mimeType: file.mimeType,
				sizeBytes: file.size,
			};
		});
	}
	const imported = await deps.importFromCloud(fileIds);
	return imported.map((record) => ({
		type: "attachment",
		attachmentId: record.attachmentId,
		name: record.originalFilename ?? "attachment",
		mimeType: record.mediaType,
		sizeBytes: record.sizeBytes,
	}));
}
