import { apiTrpcClient } from "renderer/lib/api-trpc-client";

/** Puts a file in storage and returns its id; sending the message attaches it. */
export async function uploadChannelFile(file: File): Promise<string> {
	const { fileId, upload } = await apiTrpcClient.attachment.createUpload.mutate(
		{
			name: file.name || "attachment",
			contentType: file.type || "application/octet-stream",
			sizeBytes: file.size,
		},
	);
	const response = await fetch(upload.url, {
		method: "PUT",
		headers: upload.headers,
		body: file,
	});
	if (!response.ok) throw new Error(`Upload failed (${response.status})`);
	return fileId;
}
