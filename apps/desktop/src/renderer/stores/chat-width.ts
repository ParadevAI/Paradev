import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export const CHAT_MIN_WIDTH = 520;
export const CHAT_MAX_WIDTH = 1080;

interface ChatWidthState {
	/** User-resized chat column width; null = default. */
	width: number | null;
	setWidth: (width: number | null) => void;
}

export const useChatWidthStore = create<ChatWidthState>()(
	devtools(
		persist(
			(set) => ({
				width: null,
				setWidth: (width) =>
					set({
						width:
							width === null
								? null
								: Math.round(
										Math.max(CHAT_MIN_WIDTH, Math.min(CHAT_MAX_WIDTH, width)),
									),
					}),
			}),
			{ name: "chat-width" },
		),
		{ name: "ChatWidthStore" },
	),
);

/** Chat width while a resize drag is in flight. Kept out of the persisted store,
 * which writes localStorage on every update. */
export const useLiveChatWidthStore = create<{
	width: number | null;
	setWidth: (width: number | null) => void;
}>()((set) => ({
	width: null,
	setWidth: (width) => set({ width }),
}));
