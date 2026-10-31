import type { UseQueryResult } from "@tanstack/react-query";

export interface AttachmentFileRequest {
	hostUrl: string | undefined;
	attachmentId: string;
	name: string;
	mediaType: string;
}

/** A URI for a sent attachment that an image view or viewer can open. */
export type UseAttachmentFile = (
	request: AttachmentFileRequest,
) => UseQueryResult<string>;
