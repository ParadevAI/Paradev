import { readFile } from "node:fs/promises";
import { MAX_ATTACHMENT_BYTES } from "@superset/shared/attachment-limits";
import { TRPCError } from "@trpc/server";
import type { ApiClient } from "../types";

export async function uploadSessionFile(
	api: ApiClient,
	path: string,
	name: string,
): Promise<string> {
	const bytes = await readFile(path);
	if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
		throw new TRPCError({
			code: "PAYLOAD_TOO_LARGE",
			message: "This conversation is too large to move to the cloud",
		});
	}
	const { fileId, upload } = await api.attachment.createUpload.mutate({
		name,
		contentType: "application/x-ndjson",
		sizeBytes: bytes.byteLength,
	});
	const response = await fetch(upload.url, {
		method: "PUT",
		headers: upload.headers,
		body: bytes,
	});
	if (!response.ok) {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: `Could not upload the conversation (${response.status})`,
		});
	}
	return fileId;
}
