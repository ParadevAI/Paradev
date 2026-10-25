import { create } from "zustand";

interface ViewedChannelState {
	channelId: string | null;
	setChannelId: (channelId: string | null) => void;
}

/** The channel on screen in this window, so its messages read as seen. */
export const useViewedChannelStore = create<ViewedChannelState>()((set) => ({
	channelId: null,
	setChannelId: (channelId) => set({ channelId }),
}));
