import { Trans } from "@lingui/react/macro";
import { ImagePreviewOverlay } from "renderer/routes/_authenticated/components/ImagePreviewOverlay";
import { useCopyImageToClipboard } from "renderer/routes/_authenticated/hooks/useCopyImageToClipboard";
import { useSaveImageToDownloads } from "renderer/routes/_authenticated/hooks/useSaveImageToDownloads";
import { useChatImageSource } from "../../../../hooks/useChatImageSource";
import type { GalleryImage } from "../../../../utils/galleryImages";
import { PrefetchChatImage } from "./components/PrefetchChatImage";

export function ChatImageGalleryOverlay({
	focusOnClose,
	image,
	next,
	onClose,
	onNext,
	onPrevious,
	open,
	position,
	previous,
}: {
	image: GalleryImage;
	previous: GalleryImage | undefined;
	next: GalleryImage | undefined;
	open: boolean;
	position: { index: number; total: number };
	onClose: () => void;
	onPrevious: () => void;
	onNext: () => void;
	focusOnClose: () => HTMLElement | null | undefined;
}) {
	const saveImageToDownloads = useSaveImageToDownloads();
	const copyImage = useCopyImageToClipboard();
	const source = useChatImageSource(image, { full: true });
	const src = source.status === "ready" ? source.src : null;
	const filename = image.filename;
	return (
		<>
			<ImagePreviewOverlay
				fallback={
					source.status === "error" ? (
						<Trans>Couldn't load {filename}</Trans>
					) : undefined
				}
				filename={filename}
				focusOnClose={focusOnClose}
				onClose={onClose}
				onCopy={src ? () => copyImage(src) : undefined}
				onDownload={() =>
					src ? saveImageToDownloads(src, filename) : Promise.resolve()
				}
				onNext={onNext}
				onPrevious={onPrevious}
				open={open}
				position={position}
				src={src}
			/>
			{open && previous && (
				<PrefetchChatImage image={previous} key={previous.id} />
			)}
			{open && next && <PrefetchChatImage image={next} key={next.id} />}
		</>
	);
}
