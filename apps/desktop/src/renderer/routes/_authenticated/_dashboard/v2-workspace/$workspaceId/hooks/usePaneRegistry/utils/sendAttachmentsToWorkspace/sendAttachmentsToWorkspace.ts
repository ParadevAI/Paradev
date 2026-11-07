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
	WORKSPACE_ATTACHMENTS_GITIGNORE,
} from "@superset/shared/workspace-attachments";
import { fileToBase64 } from "renderer/lib/file-to-base64";

export type AttachmentPart = Extract<UserContent, { type: "attachment" }>;

/**
 * Where a workspace's files go. `same-machine`: this desktop writes them
 * itself. `remote`: a machine someone owns, reached through the relay; the
 * bytes go to it and nowhere else. `cloud`: a box, so the bytes go through
 * our storage and outlive it.
 */
export type AttachmentRoute = "same-machine" | "remote" | "cloud";

/** Thrown for limits the user can act on; the message is toast-ready. */
export class AttachmentLimitError extends Error {}

export type AttachmentSourceProblem = "missing" | "not-a-file" | "unreadable";

/** A file on this machine that could not be attached; `index` is its place in the send. */
export class AttachmentSourceError extends Error {
	constructor(
		readonly index: number,
		readonly fileName: string,
		readonly problem: AttachmentSourceProblem,
	) {
		super(`${fileName}: ${problem}`);
	}
}

function formatMb(bytes: number): string {
	return `${Math.round(bytes / 1024 / 1024)}MB`;
}

export interface AttachmentUploadTarget {
	url: string;
	headers: Record<string, string>;
}

export type LocalAttachmentItem =
	| { kind: "path"; sourcePath: string }
	| { kind: "base64"; name: string; data: string };

export type SameMachineWriteResult =
	| { ok: true; paths: string[] }
	| { ok: false; index: number; problem: AttachmentSourceProblem };

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
	sameMachine?: {
		pathOf(file: File): string;
		readBase64(file: File): Promise<string>;
		write(items: LocalAttachmentItem[]): Promise<SameMachineWriteResult>;
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

/** Fits the request body a host holds in memory; above it, a host takes a path instead. */
export function fitsInline(file: File): boolean {
	return file.size <= MAX_INLINE_ATTACHMENT_BYTES;
}

/**
 * A host takes the bytes in one request body, so its cap is the transport's.
 * `sized` is the files whose size counts; the same-machine route copies a
 * file from disk, so only its clipboard blobs are capped.
 */
export function assertWithinLimits(
	files: File[],
	cap: number,
	sized: File[] = files,
): void {
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
	for (const file of sized) {
		if (file.size <= cap) continue;
		const name = file.name || i18n._(msg({ message: "attachment" }));
		const size = formatMb(file.size);
		const limit = formatMb(cap);
		throw new AttachmentLimitError(
			cap === MAX_INLINE_ATTACHMENT_BYTES
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

function expectOnePathEach(files: File[], paths: string[]): string[] {
	if (paths.length !== files.length) {
		throw new Error(
			`Expected ${files.length} attachment paths, got ${paths.length}`,
		);
	}
	return paths;
}

async function writeOnSameMachine(
	sameMachine: NonNullable<SendAttachmentsDeps["sameMachine"]>,
	files: File[],
): Promise<string[]> {
	const sourcePaths = files.map((file) => sameMachine.pathOf(file));
	assertWithinLimits(
		files,
		MAX_ATTACHMENT_BYTES,
		files.filter((_, index) => !sourcePaths[index]),
	);
	const items = await Promise.all(
		files.map(async (file, index): Promise<LocalAttachmentItem> => {
			const sourcePath = sourcePaths[index];
			if (sourcePath) return { kind: "path", sourcePath };
			return {
				kind: "base64",
				name: nameOf(file, index),
				data: await sameMachine.readBase64(file),
			};
		}),
	);
	const result = await sameMachine.write(items);
	if (!result.ok) {
		throw new AttachmentSourceError(
			result.index,
			files[result.index]?.name || attachmentFallbackName(result.index),
			result.problem,
		);
	}
	return expectOnePathEach(files, result.paths);
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

async function writeIntoRemoteWorktree(
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
		content: WORKSPACE_ATTACHMENTS_GITIGNORE,
		options: { create: true, overwrite: false },
	});
	if (ignore.ok === false && ignore.reason !== "exists") {
		throw new Error(ignore.reason ?? "write failed");
	}
	const paths: string[] = [];
	for (const [index, file] of files.entries()) {
		const base =
			sanitizeAttachmentFileName(nameOf(file, index)) ??
			attachmentFallbackName(index);
		const fileName = await writeUnique(
			deps,
			workspaceId,
			dirAbs,
			base,
			await fileToBase64(file),
		);
		paths.push(`${WORKSPACE_ATTACHMENTS_DIR}/${fileName}`);
	}
	return paths;
}

/**
 * The parts a chat message carries for `files`, one identity each, chosen by
 * where the workspace lives: a cloud part is a `fileId` in storage, which
 * renders without the box; a host part is an `attachmentId` in that host's
 * store, and its bytes never leave the host.
 */
export async function sendAttachments(options: {
	deps: SendAttachmentsDeps;
	route: AttachmentRoute;
	workspaceId: string;
	files: File[];
	onSent?: (part: AttachmentPart, file: File) => void;
}): Promise<AttachmentPart[]> {
	const { deps, route, workspaceId, files } = options;
	if (files.length === 0) return [];
	assertWithinLimits(
		files,
		route === "cloud" ? MAX_ATTACHMENT_BYTES : MAX_INLINE_ATTACHMENT_BYTES,
	);

	const parts: AttachmentPart[] =
		route === "cloud"
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

/**
 * Worktree-relative paths for surfaces that take text: a PTY, a file too big
 * for a part on this machine, or a chat message to a host too old to read
 * parts. This machine copies the files itself, with no cap. A relay-reached
 * host gets the bytes in the request, since storage would put them on our
 * servers. A box gets them through storage, because its ingress can cut a
 * request body the host answers early.
 */
export async function sendAttachmentsToWorkspace(options: {
	deps: SendAttachmentsDeps;
	route: AttachmentRoute;
	workspaceId: string;
	files: File[];
}): Promise<string[]> {
	const { deps, route, workspaceId, files } = options;
	if (files.length === 0) return [];
	if (route === "same-machine") {
		if (!deps.sameMachine) throw new Error("Workspace is not ready");
		return writeOnSameMachine(deps.sameMachine, files);
	}
	if (route === "remote") {
		assertWithinLimits(files, MAX_INLINE_ATTACHMENT_BYTES);
		return writeIntoRemoteWorktree(deps, workspaceId, files);
	}
	assertWithinLimits(files, MAX_ATTACHMENT_BYTES);
	const fileIds = await uploadToStorage(deps, workspaceId, files);
	const { paths } = await deps.materialize({ workspaceId, fileIds });
	return expectOnePathEach(files, paths);
}
