import type { ImageAttachment } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { AttachmentImage } from "../AttachmentImage";

export function AttachmentRail({
	className,
	images,
}: {
	images: readonly ImageAttachment[];
	className?: string;
}) {
	const byPath = new Map(images.map((image) => [image.path, image]));
	if (byPath.size === 0) return null;
	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{[...byPath.values()].map((image) => (
				<AttachmentImage
					alt={image.alt}
					key={image.path}
					path={image.path}
					type={image.mimeType}
				/>
			))}
		</div>
	);
}
