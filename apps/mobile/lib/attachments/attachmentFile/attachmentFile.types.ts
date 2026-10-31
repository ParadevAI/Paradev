export interface AttachmentUploadOptions {
	headers: Record<string, string>;
	signal: AbortSignal;
	onProgress: (progress: { bytesSent: number; totalBytes: number }) => void;
}

export interface AttachmentFile {
	/** 0 when the file cannot be read. */
	size: number;
	/** PUTs the bytes to a presigned URL. */
	upload: (
		url: string,
		options: AttachmentUploadOptions,
	) => Promise<{ status: number }>;
}

export type OpenAttachmentFile = (uri: string) => Promise<AttachmentFile>;

/** The size on disk, read synchronously; 0 when it cannot be measured. */
export type AttachmentSize = (uri: string) => number;
