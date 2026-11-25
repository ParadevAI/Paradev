import type { ImageAttachment } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { AttachmentImage } from "../AttachmentImage";

export type RailImage = { owner: string; image: ImageAttachment };

export function AttachmentRail({
	className,
	images,
}: {
	/** Each with the transcript key of the item that carries it. */
	images: readonly RailImage[];
	className?: string;
}) {
	const byPath = new Map<string, RailImage>();
	for (const entry of images) {
		if (!byPath.has(entry.image.path)) byPath.set(entry.image.path, entry);
	}
	if (byPath.size === 0) return null;
	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{[...byPath.values()].map(({ image, owner }) => (
				<AttachmentImage
					alt={image.alt}
					key={image.path}
					owner={owner}
					path={image.path}
					type={image.mimeType}
				/>
			))}
		</div>
	);
}
