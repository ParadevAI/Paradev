import { Badge } from "@superset/ui/badge";
import { useState } from "react";
import type { AttachmentPart } from "../../../../../../../../utils/sendAttachmentsToWorkspace";
import { useAttachmentSource } from "../../../../hooks/useAttachmentSource";

export function AttachmentPartImage({ part }: { part: AttachmentPart }) {
	const { src, isLoading } = useAttachmentSource(part);
	const [unrenderable, setUnrenderable] = useState(false);
	if (isLoading)
		return (
			<div className="size-40 animate-pulse rounded-2xl bg-foreground/10" />
		);
	if (!src || unrenderable)
		return <Badge variant="secondary">{part.name}</Badge>;
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
