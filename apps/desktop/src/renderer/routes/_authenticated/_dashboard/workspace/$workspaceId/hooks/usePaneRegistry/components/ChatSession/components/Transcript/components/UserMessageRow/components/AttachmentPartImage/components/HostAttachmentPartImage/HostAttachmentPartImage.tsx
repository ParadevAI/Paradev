import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import type { AttachmentPart } from "../../../../../../../../../../utils/sendAttachmentsToWorkspace";
import type { HostAttachmentRead } from "../../../../../../hooks/useAttachmentSource";
import { AttachmentThumbnail } from "../AttachmentThumbnail";

export function HostAttachmentPartImage({ part }: { part: AttachmentPart }) {
	const host = workspaceTrpc.useUtils().client;
	const hostRead = useCallback<HostAttachmentRead>(
		(attachmentId) => host.attachments.read.query({ attachmentId }),
		[host],
	);
	return <AttachmentThumbnail hostRead={hostRead} part={part} />;
}
