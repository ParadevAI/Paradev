import { cn } from "@superset/ui/utils";
import { FileText } from "lucide-react";
import { useReducer, useState } from "react";
import { THUMBNAIL_ASPECT_RATIO } from "./constants";

const RETRY_FAILED_AFTER_MS = 60_000;
const failedAtBySrc = new Map<string, number>();

interface PageThumbnailProps {
	src: string | null;
	/** Takes the height its container gives it instead of the capture's aspect ratio, cropping from the top. */
	fill?: boolean;
	className?: string;
}

/**
 * Thumbnails are captured server-side after publish and served by the
 * usercontent origin; one that has not been captured yet 404s, and the card
 * shows a placeholder until the next list refetch.
 */
export function PageThumbnail({
	src,
	fill = false,
	className,
}: PageThumbnailProps) {
	const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
	const [, rerender] = useReducer((count: number) => count + 1, 0);
	// Failures are shared across cards so a remount doesn't refetch a known
	// 404, and expire so a later list refetch retries a fresh capture.
	const failedAt = src === null ? undefined : failedAtBySrc.get(src);
	const showImage =
		src !== null &&
		!(failedAt !== undefined && Date.now() - failedAt < RETRY_FAILED_AFTER_MS);

	return (
		<div
			className={cn(
				"relative w-full overflow-hidden bg-muted/40",
				fill && "min-h-0 flex-1",
				className,
			)}
			style={fill ? undefined : { aspectRatio: THUMBNAIL_ASPECT_RATIO }}
		>
			<div className="flex h-full w-full items-center justify-center text-muted-foreground">
				<FileText className="size-5 opacity-40" />
			</div>
			{showImage && (
				<img
					src={src}
					alt=""
					aria-hidden="true"
					loading="lazy"
					decoding="async"
					onLoad={() => setLoadedSrc(src)}
					onError={() => {
						failedAtBySrc.set(src, Date.now());
						rerender();
					}}
					className={cn(
						"absolute inset-0 h-full w-full object-cover object-top",
						loadedSrc !== src && "invisible",
					)}
				/>
			)}
		</div>
	);
}
