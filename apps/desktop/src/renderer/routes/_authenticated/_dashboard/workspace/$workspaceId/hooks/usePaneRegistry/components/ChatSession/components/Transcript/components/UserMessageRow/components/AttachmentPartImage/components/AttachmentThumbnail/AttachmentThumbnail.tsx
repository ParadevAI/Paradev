import { AttachmentFileCard } from "@superset/chat-ui/AttachmentFileCard";
import { useState } from "react";
import type { AttachmentPart } from "../../../../../../../../../../utils/sendAttachmentsToWorkspace";
import {
	type HostAttachmentRead,
	useAttachmentSource,
} from "../../../../../../hooks/useAttachmentSource";

export function AttachmentThumbnail({
	hostRead,
	part,
}: {
	hostRead: HostAttachmentRead | null;
	part: AttachmentPart;
}) {
	const { src, isLoading } = useAttachmentSource(part, hostRead);
	const [unrenderable, setUnrenderable] = useState(false);
	if (isLoading)
		return (
			<div className="size-40 animate-pulse rounded-2xl bg-foreground/10" />
		);
	if (!src || unrenderable)
		return (
			<AttachmentFileCard
				className="w-auto min-w-40 max-w-72"
				mediaType={part.mimeType}
				name={part.name}
			/>
		);
	return (
		<div className="size-40 overflow-hidden rounded-2xl">
			<img
				alt={part.name}
				className="size-full object-cover"
				draggable={false}
				onError={() => setUnrenderable(true)}
				src={src}
			/>
		</div>
	);
}
