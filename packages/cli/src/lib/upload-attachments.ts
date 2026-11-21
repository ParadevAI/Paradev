import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { CLIError } from "@superset/cli-framework";
import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
	MAX_INLINE_ATTACHMENT_BYTES,
} from "@superset/shared/attachment-limits";
import mimeTypes from "mime-types";
import type { ApiClient } from "./api-client";
import type { ResolvedHostTarget } from "./host-target";

interface LocalFile {
	path: string;
	filename: string;
	mediaType: string;
	sizeBytes: number;
}

function readLocalFile(path: string): LocalFile {
	const filename = basename(path);
	const mediaType = mimeTypes.lookup(filename);
	if (!mediaType) {
		throw new CLIError(
			`Could not determine media type for attachment: ${path}`,
			"Use a recognizable file extension (e.g. .png, .pdf, .md)",
		);
	}
	let sizeBytes: number;
	try {
		sizeBytes = statSync(path).size;
	} catch {
		throw new CLIError(`Attachment not found: ${path}`);
	}
	return { path, filename, mediaType, sizeBytes };
}

function megabytes(bytes: number): string {
	return `${Math.ceil(bytes / 1024 / 1024)} MB`;
}

/**
 * Sends files to a workspace's host. Up to 25 MB a file goes inline, which
 * every host takes. A cloud workspace takes larger files through Paradev's
 * storage; a host on someone's machine does not, by design.
 */
export async function uploadAttachments({
	target,
	api,
	paths,
	fetchImpl = fetch,
}: {
	target: Pick<ResolvedHostTarget, "kind" | "client">;
	api: ApiClient;
	paths: string[];
	fetchImpl?: typeof fetch;
}): Promise<string[]> {
	const files = paths.map(readLocalFile);
	for (const file of files) {
		if (file.sizeBytes <= MAX_INLINE_ATTACHMENT_BYTES) continue;
		if (target.kind !== "cloud") {
			throw new CLIError(
				`Attachment ${file.filename} is ${megabytes(file.sizeBytes)}; a workspace on a host takes at most ${megabytes(MAX_INLINE_ATTACHMENT_BYTES)} a file`,
				"Files for a host go straight to it, not through Paradev's storage. Send a smaller file, or copy it into the workspace",
			);
		}
		assertCloudSize(file);
	}
	const ids: string[] = [];
	for (const file of files) {
		if (file.sizeBytes <= MAX_INLINE_ATTACHMENT_BYTES) {
			const result = await target.client.attachments.upload.mutate({
				data: {
					kind: "base64",
					data: readFileSync(file.path).toString("base64"),
				},
				mediaType: file.mediaType,
				originalFilename: file.filename,
			});
			ids.push(result.attachmentId);
			continue;
		}
		const fileId = await uploadToStorage(api, file, fetchImpl);
		const [imported] = await target.client.attachments.importFromCloud
			.mutate({ fileIds: [fileId] })
			.catch((error: unknown) => {
				if (
					error instanceof Error &&
					/No procedure found on path "?attachments\.importFromCloud/.test(
						error.message,
					)
				) {
					throw new CLIError(
						`This workspace's host is too old for files over ${megabytes(MAX_INLINE_ATTACHMENT_BYTES)}`,
						"Restart the workspace to update its host, or send a smaller file",
					);
				}
				throw error;
			});
		if (!imported) {
			throw new CLIError(`The workspace could not import ${file.filename}`);
		}
		ids.push(imported.attachmentId);
	}
	return ids;
}

/** Uploads files to Paradev's storage for a cloud workspace and returns their file ids. */
export async function uploadToCloudStorage({
	api,
	paths,
	fetchImpl = fetch,
}: {
	api: ApiClient;
	paths: string[];
	fetchImpl?: typeof fetch;
}): Promise<string[]> {
	if (paths.length > MAX_ATTACHMENTS) {
		throw new CLIError(
			`At most ${MAX_ATTACHMENTS} attachments can be sent at once`,
		);
	}
	const files = paths.map(readLocalFile);
	for (const file of files) assertCloudSize(file);
	const fileIds: string[] = [];
	for (const file of files) {
		fileIds.push(await uploadToStorage(api, file, fetchImpl));
	}
	return fileIds;
}

function assertCloudSize(file: LocalFile): void {
	if (file.sizeBytes <= MAX_ATTACHMENT_BYTES) return;
	throw new CLIError(
		`Attachment ${file.filename} is ${megabytes(file.sizeBytes)}; the limit is ${megabytes(MAX_ATTACHMENT_BYTES)} a file`,
	);
}

async function uploadToStorage(
	api: ApiClient,
	file: LocalFile,
	fetchImpl: typeof fetch,
): Promise<string> {
	const { fileId, upload } = await api.attachment.createUpload.mutate({
		name: file.filename,
		contentType: file.mediaType,
		sizeBytes: file.sizeBytes,
	});
	const response = await fetchImpl(upload.url, {
		method: "PUT",
		headers: upload.headers,
		body: readFileSync(file.path),
	});
	if (!response.ok) {
		throw new CLIError(
			`Could not upload ${file.filename} (${response.status})`,
		);
	}
	return fileId;
}
