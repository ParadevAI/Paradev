import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
} from "@superset/shared/attachment-limits";
import { attachmentFallbackName } from "@superset/shared/workspace-attachments";

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

function assertWithinLimits(files: File[], sized: File[] = files): void {
	if (files.length > MAX_ATTACHMENTS) {
		throw new AttachmentLimitError(
			`${files.length} files attached — a message carries at most ${MAX_ATTACHMENTS}`,
		);
	}
	for (const file of sized) {
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
 * Gets composer files into a workspace's worktree and returns the
 * worktree-relative paths an agent is handed, in the order of `files`.
 *
 * A workspace on this machine gets them from the desktop main process and
 * nothing leaves the machine. Any other workspace gets them through storage,
 * like the mobile composer: client → presigned PUT, then the host pulls them,
 * so the host-service request carries only ids and a sandbox ingress that
 * cuts an upload answered early never sees the bytes.
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
	if (deps.sameMachine) return writeOnSameMachine(deps.sameMachine, files);
	assertWithinLimits(files);

	const fileIds = await Promise.all(
		files.map((file, index) => uploadOne(deps, file, index)),
	);
	if (isCloudWorkspace) {
		await deps.attachFiles({ id: workspaceId, fileIds });
	}
	const { paths } = await deps.materialize({ workspaceId, fileIds });
	return expectOnePathEach(files, paths);
}
