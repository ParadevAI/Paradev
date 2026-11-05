import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { GalleryImage } from "../../utils/galleryImages";
import { ChatImageGalleryOverlay } from "./components/ChatImageGalleryOverlay";

type ChatImageGallery = {
	open: (id: string) => void;
	registerThumbnail: (id: string, element: HTMLElement | null) => void;
};

const ChatImageGalleryContext = createContext<ChatImageGallery>({
	open: () => {},
	registerThumbnail: () => {},
});

/**
 * One preview overlay for every image in the transcript. Thumbnails open it
 * by id and the overlay steps through `images` in order, whether or not the
 * neighbouring thumbnails are mounted.
 */
export function ChatImageGalleryProvider({
	children,
	images,
}: {
	images: readonly GalleryImage[];
	children: ReactNode;
}) {
	const [current, setCurrent] = useState<GalleryImage | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const openerId = useRef<string | null>(null);
	const thumbnails = useRef(new Map<string, HTMLElement>());
	const imagesRef = useRef(images);
	imagesRef.current = images;

	const open = useCallback((id: string) => {
		const image = imagesRef.current.find((candidate) => candidate.id === id);
		if (!image) return;
		openerId.current = id;
		setCurrent(image);
		setIsOpen(true);
	}, []);
	const registerThumbnail = useCallback(
		(id: string, element: HTMLElement | null) => {
			if (element) thumbnails.current.set(id, element);
			else thumbnails.current.delete(id);
		},
		[],
	);
	const value = useMemo(
		() => ({ open, registerThumbnail }),
		[open, registerThumbnail],
	);

	const index = current
		? images.findIndex((image) => image.id === current.id)
		: -1;
	const gone = isOpen && index === -1;
	useEffect(() => {
		if (gone) setIsOpen(false);
	}, [gone]);
	const shown = images[index] ?? current;
	const neighbour = (delta: number) =>
		index === -1 || images.length < 2
			? undefined
			: images[(index + delta + images.length) % images.length];
	const step = (delta: number) => {
		const next = neighbour(delta);
		if (next) setCurrent(next);
	};
	const focusOnClose = () =>
		(shown && thumbnails.current.get(shown.id)) ??
		(openerId.current ? thumbnails.current.get(openerId.current) : null);

	return (
		<ChatImageGalleryContext.Provider value={value}>
			{children}
			{shown && (
				<ChatImageGalleryOverlay
					focusOnClose={focusOnClose}
					image={shown}
					next={neighbour(1)}
					onClose={() => setIsOpen(false)}
					onNext={() => step(1)}
					onPrevious={() => step(-1)}
					open={isOpen && !gone}
					position={{ index, total: images.length }}
					previous={neighbour(-1)}
				/>
			)}
		</ChatImageGalleryContext.Provider>
	);
}

export function useChatImageGallery(): ChatImageGallery {
	return useContext(ChatImageGalleryContext);
}
