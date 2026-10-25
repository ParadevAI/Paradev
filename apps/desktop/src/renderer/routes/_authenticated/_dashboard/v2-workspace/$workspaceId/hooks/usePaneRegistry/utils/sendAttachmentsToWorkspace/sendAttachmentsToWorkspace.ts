import { msg } from "@lingui/core/macro";
import type { UserContent } from "@superset/chat/protocol";
import { i18n } from "@superset/i18n";
import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
	MAX_INLINE_ATTACHMENT_BYTES,
} from "@superset/shared/attachment-limits";
import {
	attachmentFallbackName,
	attachmentNameWithSuffix,
	sanitizeAttachmentFileName,
	WORKSPACE_ATTACHMENTS_DIR,
} from "@superset/shared/workspace-attachments";
import { fileToBase64 } from "renderer/lib/file-to-base64";

export type AttachmentPart = Extract<UserContent, { type: "attachment" }>;

/**
 * Where a workspace's attachments live. `cloud`: a box, so the bytes go to our
 * storage and outlive it. `host`: a machine someone owns, so the bytes go to
 * that host and nowhere else.
 */
export type AttachmentHome = "cloud" | "host";

/** Thrown for limits the user can act on; the message is toast-ready. */
export class AttachmentLimitError extends Error {}

function formatMb(bytes: number): string {
	return `${Math.round(bytes / 1024 / 1024)}MB`;
}

export interface AttachmentUploadTarget {
	url: string;
	headers: Record<string, string>;
}

interface FsWriteOutcome {
	ok: boolean;
	reason?: string;
}

export interface SendAttachmentsDeps {
	createUpload(input: {
		name: string;
		contentType: string;
		sizeBytes: number;
	}): Promise<{ fileId: string; upload: AttachmentUploadTarget }>;
	putObject(target: AttachmentUploadTarget, file: File): Promise<Response>;
	/** A box can fetch only the files attached to it. */
	attachFiles(input: { id: string; fileIds: string[] }): Promise<unknown>;
	materialize(input: {
		workspaceId: string;
		fileIds: string[];
	}): Promise<{ paths: string[] }>;
	hostUpload(input: {
		data: { kind: "base64"; data: string };
		mediaType: string;
		originalFilename: string;
	}): Promise<{ attachmentId: string; mediaType: string; sizeBytes: number }>;
	worktreePath(workspaceId: string): Promise<string>;
	createDirectory(input: {
		workspaceId: string;
		absolutePath: string;
		recursive: boolean;
	}): Promise<unknown>;
	writeFile(input: {
		workspaceId: string;
		absolutePath: string;
		content: string | { kind: "base64"; data: string };
		options: { create: boolean; overwrite: boolean };
	}): Promise<FsWriteOutcome>;
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
const MAX_NAME_ATTEMPTS = 50;

/**
 * Clipboard files keep their name when they have one (Chromium synthesizes
 * "image.png" for a screenshot; Finder copies keep the real name); a blob
 * with none takes its extension from the mime type, the only signal it
 * carries.
 */
function nameOf(file: File, index: number): string {
	if (file.name) return file.name;
	const extension = MIME_EXTENSIONS[file.type];
	return attachmentFallbackName(index, extension ? `.${extension}` : "");
}

function typeOf(file: File): string {
	return file.type || FALLBACK_CONTENT_TYPE;
}

/**
 * A host workspace takes the bytes in one request body, which the host holds
 * in memory; storage is not an option there, so its cap is the transport's.
 */
export function assertWithinLimits(files: File[], home: AttachmentHome): void {
	if (files.length > MAX_ATTACHMENTS) {
		const count = files.length;
		const max = MAX_ATTACHMENTS;
		throw new AttachmentLimitError(
			i18n._(
				msg({
					message: `${count} files attached — a message carries at most ${max}`,
				}),
			),
		);
	}
	const cap =
		home === "host" ? MAX_INLINE_ATTACHMENT_BYTES : MAX_ATTACHMENT_BYTES;
	for (const file of files) {
		if (file.size <= cap) continue;
		const name = file.name || i18n._(msg({ message: "attachment" }));
		const size = formatMb(file.size);
		const limit = formatMb(cap);
		throw new AttachmentLimitError(
			home === "host"
				? i18n._(
						msg({
							message: `"${name}" is ${size} — files over ${limit} can't be attached to this workspace. If the file is on the workspace's machine, mention its path instead.`,
						}),
					)
				: i18n._(
						msg({
							message: `"${name}" is ${size} — files over ${limit} can't be attached`,
						}),
					),
		);
	}
}

async function uploadToStorage(
	deps: SendAttachmentsDeps,
	workspaceId: string,
	files: File[],
): Promise<string[]> {
	const fileIds = await Promise.all(
		files.map(async (file, index) => {
			const name = nameOf(file, index);
			const { fileId, upload } = await deps.createUpload({
				name,
				contentType: typeOf(file),
				sizeBytes: file.size,
			});
			const response = await deps.putObject(upload, file);
			if (!response.ok) {
				throw new Error(`Upload failed for ${name} (${response.status})`);
			}
			return fileId;
		}),
	);
	await deps.attachFiles({ id: workspaceId, fileIds });
	return fileIds;
}

/**
 * The parts a chat message carries for `files`. Each part names exactly one
 * identity, chosen by where the workspace lives: a cloud part is a `fileId`
 * in storage, which renders without the box; a host part is an
 * `attachmentId` in that host's store, and its bytes never leave the host.
 */
export async function sendAttachments(options: {
	deps: SendAttachmentsDeps;
	home: AttachmentHome;
	workspaceId: string;
	files: File[];
	onSent?: (part: AttachmentPart, file: File) => void;
}): Promise<AttachmentPart[]> {
	const { deps, home, workspaceId, files } = options;
	if (files.length === 0) return [];
	assertWithinLimits(files, home);

	const parts: AttachmentPart[] =
		home === "cloud"
			? (await uploadToStorage(deps, workspaceId, files)).map(
					(fileId, index) => {
						const file = files[index] as File;
						return {
							type: "attachment",
							fileId,
							name: nameOf(file, index),
							mimeType: typeOf(file),
							sizeBytes: file.size,
						};
					},
				)
			: await Promise.all(
					files.map(async (file, index) => {
						const record = await deps.hostUpload({
							data: { kind: "base64", data: await fileToBase64(file) },
							mediaType: typeOf(file),
							originalFilename: nameOf(file, index),
						});
						return {
							type: "attachment" as const,
							attachmentId: record.attachmentId,
							name: nameOf(file, index),
							mimeType: record.mediaType,
							sizeBytes: record.sizeBytes,
						};
					}),
				);
	for (const [index, part] of parts.entries()) {
		options.onSent?.(part, files[index] as File);
	}
	return parts;
}

function baseFileName(file: File, index: number): string {
	return sanitizeAttachmentFileName(nameOf(file, index)) ?? nameOf(file, index);
}

/**
 * Create-only writes report "exists", so the real directory decides the name:
 * a second screenshot must never overwrite a path an earlier prompt names.
 */
async function writeUnique(
	deps: SendAttachmentsDeps,
	workspaceId: string,
	dirAbs: string,
	base: string,
	data: string,
): Promise<string> {
	for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
		const fileName = attachmentNameWithSuffix(base, attempt);
		const outcome = await deps.writeFile({
			workspaceId,
			absolutePath: `${dirAbs}/${fileName}`,
			content: { kind: "base64", data },
			options: { create: true, overwrite: false },
		});
		if (outcome.ok !== false) return fileName;
		if (outcome.reason !== "exists") {
			throw new Error(outcome.reason ?? "write failed");
		}
	}
	throw new Error(`Could not find a free name for ${base}`);
}

async function writeIntoWorktree(
	deps: SendAttachmentsDeps,
	workspaceId: string,
	files: File[],
): Promise<string[]> {
	const dirAbs = `${await deps.worktreePath(workspaceId)}/${WORKSPACE_ATTACHMENTS_DIR}`;
	await deps.createDirectory({
		workspaceId,
		absolutePath: dirAbs,
		recursive: true,
	});
	const ignore = await deps.writeFile({
		workspaceId,
		absolutePath: `${dirAbs}/.gitignore`,
		content: "*\n",
		options: { create: true, overwrite: false },
	});
	if (ignore.ok === false && ignore.reason !== "exists") {
		throw new Error(ignore.reason ?? "write failed");
	}
	const paths: string[] = [];
	for (const [index, file] of files.entries()) {
		const fileName = await writeUnique(
			deps,
			workspaceId,
			dirAbs,
			baseFileName(file, index),
			await fileToBase64(file),
		);
		paths.push(`${WORKSPACE_ATTACHMENTS_DIR}/${fileName}`);
	}
	return paths;
}

/**
 * Worktree-relative paths for surfaces that take text: a PTY, or a chat
 * message to a host too old to read attachment parts. A box gets the bytes
 * through storage, because its ingress can cut a request body the host
 * answers early; a host gets them in the request, since storage would put
 * them on our servers.
 */
export async function sendAttachmentsToWorkspace(options: {
	deps: SendAttachmentsDeps;
	home: AttachmentHome;
	workspaceId: string;
	files: File[];
}): Promise<string[]> {
	const { deps, home, workspaceId, files } = options;
	if (files.length === 0) return [];
	assertWithinLimits(files, home);
	if (home === "host") return writeIntoWorktree(deps, workspaceId, files);
	const fileIds = await uploadToStorage(deps, workspaceId, files);
	const { paths } = await deps.materialize({ workspaceId, fileIds });
	return paths;
}
