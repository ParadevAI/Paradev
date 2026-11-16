import { create } from "zustand";
import type { ChatsStore } from "../../hooks/useChatsStore";

interface ChatsBridgeState {
	store: ChatsStore | null;
	setStore: (store: ChatsStore | null) => void;
}

/** Where the one mounted chat store is read from, by the sidebar and the chat screens alike. */
export const useChatsBridge = create<ChatsBridgeState>()((set) => ({
	store: null,
	setStore: (store) => set({ store }),
}));
