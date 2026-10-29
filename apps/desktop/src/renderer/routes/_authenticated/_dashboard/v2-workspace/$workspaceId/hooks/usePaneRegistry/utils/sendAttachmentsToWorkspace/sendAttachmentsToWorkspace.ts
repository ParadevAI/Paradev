import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
} from "@superset/shared/attachment-limits";
import { attachmentFallbackName } from "@superset/shared/workspace-attachments";

/** Thrown for limits the user can act on; the message is toast-ready. */
export class AttachmentLimitError extends Error {}

function formatMb(bytes: number): string {
	return `${Math.round(bytes / 1024 / 1024)}MB`;
}

export interface AttachmentUploadTarget {
	url: string;
	headers: Record<string, string>;
}

export interface SendAttachmentsDeps {
	createUpload(input: {
		name: string;
		contentType: string;
		sizeBytes: number;
	}): Promise<{ fileId: string; upload: AttachmentUploadTarget }>;
	putObject(target: AttachmentUploadTarget, file: File): Promise<Response>;
	/** Cloud only: a box can fetch only the files attached to it. */
	attachFiles(input: { id: string; fileIds: string[] }): Promise<unknown>;
	materialize(input: {
		workspaceId: string;
		fileIds: string[];
	}): Promise<{ paths: string[] }>;
	/**
	 * Set only when the workspace is on this machine. A file with a disk path
	 * is then copied into the worktree: it never goes to storage and has no
	 * size limit.
	 */
	local?: {
		pathOf(file: File): string;
		copy(sourcePaths: string[]): Promise<string[]>;
	};
}

const MIME_EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
	"image/tiff": "tiff",
	"image/bmp": "bmp",
};

const FALLBACK_CONTENT_TYPE = "application/octet-stream";

/**
 * Clipboard files keep their name when they have one (Chromium synthesizes
 * "image.png" for a screenshot; Finder copies keep the real name); a blob
 * with none takes its extension from the mime type, the only signal it
 * carries. The host sanitizes and deduplicates whatever arrives.
 */
function nameOf(file: File, index: number): string {
	if (file.name) return file.name;
	const extension = MIME_EXTENSIONS[file.type];
	return attachmentFallbackName(index, extension ? `.${extension}` : "");
}

function assertWithinLimits(files: File[], uploads: File[]): void {
	if (files.length > MAX_ATTACHMENTS) {
		throw new AttachmentLimitError(
			`${files.length} files attached — a message carries at most ${MAX_ATTACHMENTS}`,
		);
	}
	for (const file of uploads) {
		if (file.size > MAX_ATTACHMENT_BYTES) {
			throw new AttachmentLimitError(
				`"${file.name || "attachment"}" is ${formatMb(file.size)} — files over ${formatMb(MAX_ATTACHMENT_BYTES)} can't be attached`,
			);
		}
	}
}

async function uploadOne(
	deps: SendAttachmentsDeps,
	file: File,
	index: number,
): Promise<string> {
	const name = nameOf(file, index);
	const { fileId, upload } = await deps.createUpload({
		name,
		contentType: file.type || FALLBACK_CONTENT_TYPE,
		sizeBytes: file.size,
	});
	const response = await deps.putObject(upload, file);
	if (!response.ok) {
		throw new Error(`Upload failed for ${name} (${response.status})`);
	}
	return fileId;
}

/**
 * Gets composer files into a workspace's worktree and returns the
 * worktree-relative paths an agent is handed — the same route the mobile
 * composer and the new-workspace modal take: bytes go client → cloud storage
 * over a presigned PUT, and the host pulls them from there. The host-service
 * request carries only ids, so neither a relay's body cap nor a sandbox
 * ingress that cuts an upload the host answers early ever sees the bytes.
 *
 * The caller owns the error surface; a thrown `AttachmentLimitError` is
 * already worded for a toast.
 */
export async function sendAttachmentsToWorkspace(options: {
	deps: SendAttachmentsDeps;
	workspaceId: string;
	isCloudWorkspace: boolean;
	files: File[];
}): Promise<string[]> {
	const { deps, workspaceId, isCloudWorkspace, files } = options;
	if (files.length === 0) return [];
	const localPaths = files.map((file) => deps.local?.pathOf(file) ?? "");
	const uploads = files.filter((_, index) => !localPaths[index]);
	assertWithinLimits(files, uploads);

	// Order is kept: the host names attachments positionally and the caller
	// pairs each path back with the file it came from.
	const uploadedPaths = await uploadAndMaterialize(
		deps,
		workspaceId,
		isCloudWorkspace,
		files,
		localPaths,
	);
	const copySources = localPaths.filter(Boolean);
	const copiedPaths =
		deps.local && copySources.length > 0
			? await deps.local.copy(copySources)
			: [];
	return localPaths.map((localPath) =>
		localPath ? (copiedPaths.shift() ?? "") : (uploadedPaths.shift() ?? ""),
	);
}

async function uploadAndMaterialize(
	deps: SendAttachmentsDeps,
	workspaceId: string,
	isCloudWorkspace: boolean,
	files: File[],
	localPaths: string[],
): Promise<string[]> {
	const fileIds = await Promise.all(
		files.flatMap((file, index) =>
			localPaths[index] ? [] : [uploadOne(deps, file, index)],
		),
	);
	if (fileIds.length === 0) return [];
	if (isCloudWorkspace) {
		await deps.attachFiles({ id: workspaceId, fileIds });
	}
	const { paths } = await deps.materialize({ workspaceId, fileIds });
	return paths;
}
