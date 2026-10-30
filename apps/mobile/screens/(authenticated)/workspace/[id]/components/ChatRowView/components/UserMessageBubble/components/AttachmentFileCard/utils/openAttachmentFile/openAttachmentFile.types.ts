export interface AttachmentFile {
	uri: string;
	name: string;
	mediaType: string;
}

/** Shows a sent file in the platform's viewer. Rejects when nothing can open it. */
export type OpenAttachmentFile = (file: AttachmentFile) => Promise<void>;
