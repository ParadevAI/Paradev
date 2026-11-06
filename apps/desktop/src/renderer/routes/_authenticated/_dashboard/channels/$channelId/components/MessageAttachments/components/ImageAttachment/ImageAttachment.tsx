import type { ChannelAttachment } from "@superset/shared/channels";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { Size } from "../../utils/galleryLayout";

interface ImageAttachmentProps {
	file: ChannelAttachment;
	size: Size;
	/** Images folded behind this one, shown as "+N" over it. */
	moreCount: number;
	onShowMore: () => void;
	onNaturalSize: (size: Size) => void;
	onFailed: () => void;
}

export function ImageAttachment({
	file,
	size,
	moreCount,
	onShowMore,
	onNaturalSize,
	onFailed,
}: ImageAttachmentProps) {
	return (
		<div
			style={{ width: size.width, height: size.height }}
			className="relative shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
		>
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<a
						href={file.url}
						target="_blank"
						rel="noreferrer"
						className="block size-full"
					>
						<img
							src={file.url}
							alt={file.name}
							onLoad={(event) =>
								onNaturalSize({
									width: event.currentTarget.naturalWidth,
									height: event.currentTarget.naturalHeight,
								})
							}
							onError={onFailed}
							className="size-full object-cover"
						/>
					</a>
				</TooltipTrigger>
				<TooltipContent>{file.name}</TooltipContent>
			</Tooltip>
			{moreCount > 0 && (
				<button
					type="button"
					onClick={onShowMore}
					className="absolute inset-0 flex items-center justify-center bg-black/50 text-xl font-semibold text-white"
				>
					+{moreCount}
				</button>
			)}
		</div>
	);
}
