import { AttachmentFileCard } from "@superset/chat-ui/AttachmentFileCard";
import type { ComponentProps } from "react";
import { useChatPaneActions } from "../../../../providers/ChatPaneActionsProvider";
import { HostAttachmentImage } from "./components/HostAttachmentImage";

export function AttachmentImage(
	props: ComponentProps<typeof HostAttachmentImage>,
) {
	const { workspaceId } = useChatPaneActions();
	if (!workspaceId)
		return (
			<AttachmentFileCard
				name={props.name || (props.path.split("/").pop() ?? props.path)}
				mediaType={props.type}
			/>
		);
	return <HostAttachmentImage {...props} />;
}
