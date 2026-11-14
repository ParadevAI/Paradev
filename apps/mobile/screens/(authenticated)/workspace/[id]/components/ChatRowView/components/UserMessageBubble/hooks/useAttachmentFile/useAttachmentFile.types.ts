import type { UseQueryResult } from "@tanstack/react-query";

/** Which copy of a sent attachment to fetch; a path tag has neither. */
export interface AttachmentSource {
	fileId?: string;
	attachmentId?: string;
}

export interface AttachmentFileRequest {
	hostUrl: string | undefined;
	source: AttachmentSource;
	name: string;
	mediaType: string;
}

/** A URI for a sent attachment that an image view or viewer can open. */
export type UseAttachmentFile = (
	request: AttachmentFileRequest,
) => UseQueryResult<string>;
