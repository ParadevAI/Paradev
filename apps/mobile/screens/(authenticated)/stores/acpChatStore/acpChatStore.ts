import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * EXPERIMENT: open Claude and Codex sessions as chats. Device-local and off
 * until the person turns it on in Settings → Experimental; agents without ACP
 * support open a terminal either way.
 */
interface AcpChatStore {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useAcpChatStore = create<AcpChatStore>()(
	persist(
		(set) => ({
			enabled: false,
			setEnabled: (enabled) => set({ enabled }),
		}),
		{
			name: "acp-chat-v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: ({ enabled }) => ({ enabled }),
		},
	),
);

export function useAcpChatEnabled(): boolean {
	return useAcpChatStore((state) => state.enabled);
}
