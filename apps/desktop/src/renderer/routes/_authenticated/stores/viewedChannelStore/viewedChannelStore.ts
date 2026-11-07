import { create } from "zustand";

interface ViewedChannelState {
	channelId: string | null;
	threadRootId: string | null;
	/** The Threads view shows every followed thread. */
	threadsView: boolean;
	setChannelId: (channelId: string | null) => void;
	setThreadRootId: (threadRootId: string | null) => void;
	setThreadsView: (threadsView: boolean) => void;
}

/** What is on screen in this window, so its messages read as seen and do not notify. */
export const useViewedChannelStore = create<ViewedChannelState>()((set) => ({
	channelId: null,
	threadRootId: null,
	threadsView: false,
	setChannelId: (channelId) => set({ channelId }),
	setThreadRootId: (threadRootId) => set({ threadRootId }),
	setThreadsView: (threadsView) => set({ threadsView }),
}));
