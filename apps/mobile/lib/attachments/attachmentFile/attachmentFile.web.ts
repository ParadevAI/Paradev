import type {
	AttachmentSize,
	OpenAttachmentFile,
} from "./attachmentFile.types";

// A blob URL has no synchronous size; the upload measures it.
export const attachmentSize: AttachmentSize = () => 0;

export const openAttachmentFile: OpenAttachmentFile = async (uri) => {
	const blob = await fetch(uri)
		.then((response) => response.blob())
		.catch(() => null);
	return {
		size: blob?.size ?? 0,
		upload: (url, { headers, signal, onProgress }) =>
			new Promise((resolve, reject) => {
				const request = new XMLHttpRequest();
				request.open("PUT", url);
				for (const [name, value] of Object.entries(headers)) {
					request.setRequestHeader(name, value);
				}
				request.upload.onprogress = (event) =>
					onProgress({
						bytesSent: event.loaded,
						totalBytes: event.lengthComputable ? event.total : 0,
					});
				request.onload = () => resolve({ status: request.status });
				request.onerror = () => reject(new TypeError("Network request failed"));
				request.onabort = () =>
					reject(new DOMException("Aborted", "AbortError"));
				signal.addEventListener("abort", () => request.abort());
				request.send(blob);
			}),
	};
};
