import { useChatImageSource } from "../../../../../../hooks/useChatImageSource";
import type { GalleryImage } from "../../../../../../utils/galleryImages";

/** Pulls an image's bytes into the query cache so stepping to it is instant. */
export function PrefetchChatImage({ image }: { image: GalleryImage }) {
	useChatImageSource(image, { full: true });
	return null;
}
