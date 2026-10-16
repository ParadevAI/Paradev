import { apiTrpcClient } from "renderer/lib/api-trpc-client";

/** Puts a file in storage for the draft, reporting progress from 0 to 1; resolves with its file id. */
export async function uploadAttachment(
	file: File,
	onProgress: (fraction: number) => void,
): Promise<string> {
	const { fileId, upload } = await apiTrpcClient.attachment.createUpload.mutate(
		{
			name: file.name || "attachment",
			contentType: file.type || "application/octet-stream",
			sizeBytes: file.size,
		},
	);
	await new Promise<void>((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("PUT", upload.url);
		for (const [name, value] of Object.entries(upload.headers ?? {}))
			request.setRequestHeader(name, String(value));
		request.upload.onprogress = (event) => {
			if (event.lengthComputable) onProgress(event.loaded / event.total);
		};
		request.onload = () =>
			request.status >= 200 && request.status < 300
				? resolve()
				: reject(new Error(`Upload failed (${request.status})`));
		request.onerror = () => reject(new Error("Upload failed"));
		request.send(file);
	});
	onProgress(1);
	return fileId;
}
