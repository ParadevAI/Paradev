import type { AttachmentPart } from "../../../../../../../../utils/sendAttachmentsToWorkspace";
import { useChatPaneActions } from "../../../../../../providers/ChatPaneActionsProvider";
import { AttachmentThumbnail } from "./components/AttachmentThumbnail";
import { HostAttachmentPartImage } from "./components/HostAttachmentPartImage";

export function AttachmentPartImage({ part }: { part: AttachmentPart }) {
	const { workspaceId } = useChatPaneActions();
	if (!workspaceId) return <AttachmentThumbnail hostRead={null} part={part} />;
	return <HostAttachmentPartImage part={part} />;
}
